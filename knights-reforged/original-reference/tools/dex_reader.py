#!/usr/bin/env python3
"""Offline DEX 035 table reader/disassembler. No APK code is executed."""
import collections
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def signed(n, bits):
    return n - (1 << bits) if n & (1 << (bits - 1)) else n


class Dex:
    def __init__(self, path):
        self.data = Path(path).read_bytes()
        assert self.data[:8] == b'dex\n035\0'
        assert self.u32(32) == len(self.data)
        import zlib
        self.integrity = {'sha1_stored': self.data[12:32].hex(), 'sha1_computed': hashlib.sha1(self.data[32:]).hexdigest(),
                          'adler32_stored': f'{self.u32(8):08x}', 'adler32_computed': f'{zlib.adler32(self.data[12:]) & 0xffffffff:08x}'}
        self.strings = []
        for i in range(self.u32(56)):
            off = self.u32(self.u32(60) + 4*i)
            _, off = self.uleb(off)
            end = self.data.index(b'\0', off)
            self.strings.append(self.data[off:end].replace(b'\xc0\x80', b'\0').decode('utf-8', 'replace'))
        self.types = [self.strings[self.u32(self.u32(68)+4*i)] for i in range(self.u32(64))]
        self.protos = []
        for i in range(self.u32(72)):
            off = self.u32(76) + 12*i
            args = self.u32(off+8)
            params = [] if args == 0 else [self.types[self.u16(args+4+2*j)] for j in range(self.u32(args))]
            self.protos.append('(' + ''.join(params) + ')' + self.types[self.u32(off+4)])
        self.fields = []
        for i in range(self.u32(80)):
            off = self.u32(84)+8*i
            self.fields.append(self.types[self.u16(off)]+'->'+self.strings[self.u32(off+4)]+':'+self.types[self.u16(off+2)])
        self.methods = []
        for i in range(self.u32(88)):
            off = self.u32(92)+8*i
            self.methods.append(self.types[self.u16(off)]+'->'+self.strings[self.u32(off+4)]+self.protos[self.u16(off+2)])
        self.classes = []
        for i in range(self.u32(96)):
            off = self.u32(100)+32*i
            ci, access, sup, interfaces, source, annotations, cdata, static = struct.unpack_from('<8I', self.data, off)
            item = {'name':self.types[ci], 'access':access, 'super': None if sup == 0xffffffff else self.types[sup],
                    'source':None if source == 0xffffffff else self.strings[source], 'fields':[], 'methods':[], 'static_values_off':static}
            item['interfaces'] = [] if not interfaces else [self.types[self.u16(interfaces+4+2*j)] for j in range(self.u32(interfaces))]
            if cdata:
                counts=[]
                for _ in range(4):
                    n,cdata=self.uleb(cdata);counts.append(n)
                for count in counts[:2]:
                    idx=0
                    for _ in range(count):
                        diff,cdata=self.uleb(cdata);idx+=diff
                        acc,cdata=self.uleb(cdata)
                        item['fields'].append({'id':idx,'access':acc,'name':self.fields[idx]})
                for count in counts[2:]:
                    idx=0
                    for _ in range(count):
                        diff,cdata=self.uleb(cdata);idx+=diff
                        acc,cdata=self.uleb(cdata)
                        code,cdata=self.uleb(cdata)
                        item['methods'].append({'id':idx,'access':acc,'code_off':code,'name':self.methods[idx]})
            self.classes.append(item)

    def encoded_value(self, off):
        header=self.data[off];off+=1;kind=header&31;size=(header>>5)+1
        if kind==0x1e:return None,off
        if kind==0x1f:return bool(header>>5),off
        if kind==0x1c:
            count,off=self.uleb(off);values=[]
            for _ in range(count):
                value,off=self.encoded_value(off);values.append(value)
            return values,off
        assert kind!=0x1d,'annotation not supported here'
        value=int.from_bytes(self.data[off:off+size],'little');off+=size
        if kind in (0x00,0x02,0x04,0x06):value=signed(value,size*8)
        if kind==0x17:value=self.strings[value]
        if kind==0x18:value=self.types[value]
        return value,off

    def static_values(self, item):
        off=item['static_values_off']
        if not off:return {}
        count,off=self.uleb(off);values={}
        for f in item['fields'][:count]:
            value,off=self.encoded_value(off);values[f['name']]=value
        return values

    def u16(self, o):return struct.unpack_from('<H', self.data, o)[0]
    def u32(self, o):return struct.unpack_from('<I', self.data, o)[0]
    def uleb(self, o):
        val=shift=0
        while True:
            b=self.data[o];o+=1;val|=(b&127)<<shift
            if b<128:return val,o
            shift+=7

    def sleb(self, o):
        val=shift=0
        while True:
            b=self.data[o];o+=1;val|=(b&127)<<shift;shift+=7
            if b<128:return (val-(1<<shift) if b&64 else val),o

    def disasm(self, method):
        off=method['code_off']
        if not off:return []
        regs,ins,outs,tries,debug,size=struct.unpack_from('<4H2I', self.data, off)
        units=list(struct.unpack_from('<'+'H'*size, self.data, off+16))
        lines=[f'# code_off=0x{off:x} registers={regs} incoming_words={ins} outgoing_words={outs} code_units={size} tries={tries}']
        pc=0
        while pc<size:
            w=units[pc];op=w&255;a=(w>>8)&15;b=w>>12;aa=w>>8
            name,fmt=OPS.get(op,(f'unknown-{op:02x}','10x'))
            width=WIDTHS[fmt];arg=''
            u=lambda n:units[pc+n]
            if op==0 and aa:
                if aa==1:
                    n=u(1);width=4+2*n;arg=f'packed-switch-payload size={n} first_key={signed(u(2)|(u(3)<<16),32)} targets='+str([signed(u(4+2*j)|(u(5+2*j)<<16),32) for j in range(n)])
                elif aa==2:
                    n=u(1);width=2+4*n;arg=f'sparse-switch-payload size={n} keys='+str([signed(u(2+2*j)|(u(3+2*j)<<16),32) for j in range(n)])+' targets='+str([signed(u(2+2*n+2*j)|(u(3+2*n+2*j)<<16),32) for j in range(n)])
                elif aa==3:
                    ew=u(1);n=u(2)|(u(3)<<16);width=4+(ew*n+1)//2;arg=f'fill-array-data-payload element_width={ew} count={n} bytes='+self.data[off+16+2*(pc+4):off+16+2*(pc+4)+ew*n].hex()
                name='payload'
            elif fmt=='12x':arg=f'v{a}, v{b}'
            elif fmt=='11n':arg=f'v{a}, {signed(b,4)}'
            elif fmt=='11x':arg=f'v{aa}'
            elif fmt=='10t':arg=f'@{pc+signed(aa,8):04x}'
            elif fmt=='20t':arg=f'@{pc+signed(u(1),16):04x}'
            elif fmt=='22x':arg=f'v{aa}, v{u(1)}'
            elif fmt=='21t':arg=f'v{aa}, @{pc+signed(u(1),16):04x}'
            elif fmt=='21s':arg=f'v{aa}, {signed(u(1),16)}'
            elif fmt=='21h':arg=f'v{aa}, 0x{u(1) << (48 if op==0x19 else 16):x}'
            elif fmt=='21c':
                idx=u(1);ref=self.strings[idx] if op==0x1a else self.types[idx] if op in (0x1c,0x1f,0x22) else self.fields[idx]
                arg=f'v{aa}, '+json.dumps(ref,ensure_ascii=False)
            elif fmt=='23x':arg=f'v{aa}, v{u(1)&255}, v{u(1)>>8}'
            elif fmt=='22b':arg=f'v{aa}, v{u(1)&255}, {signed(u(1)>>8,8)}'
            elif fmt=='22t':arg=f'v{a}, v{b}, @{pc+signed(u(1),16):04x}'
            elif fmt=='22s':arg=f'v{a}, v{b}, {signed(u(1),16)}'
            elif fmt=='22c':arg=f'v{a}, v{b}, '+json.dumps(self.types[u(1)] if op in (0x20,0x23) else self.fields[u(1)])
            elif fmt=='30t':arg=f'@{pc+signed(u(1)|(u(2)<<16),32):04x}'
            elif fmt=='32x':arg=f'v{u(1)}, v{u(2)}'
            elif fmt=='31i':arg=f'v{aa}, {signed(u(1)|(u(2)<<16),32)} (0x{u(1)|(u(2)<<16):08x})'
            elif fmt=='31t':arg=f'v{aa}, @{pc+signed(u(1)|(u(2)<<16),32):04x}'
            elif fmt=='31c':arg=f'v{aa}, '+json.dumps(self.strings[u(1)|(u(2)<<16)])
            elif fmt=='35c':
                count=b;rr=[u(2)&15,(u(2)>>4)&15,(u(2)>>8)&15,u(2)>>12,a][:count]
                ref=self.types[u(1)] if op==0x24 else self.methods[u(1)]
                arg='{'+', '.join('v'+str(x) for x in rr)+'}, '+ref
            elif fmt=='3rc':
                ref=self.types[u(1)] if op==0x25 else self.methods[u(1)]
                arg='{'+', '.join('v'+str(x) for x in range(u(2),u(2)+aa))+'}, '+ref
            elif fmt=='51l':arg=f'v{aa}, {signed(sum(u(1+j)<<(16*j) for j in range(4)),64)}'
            lines.append(f'{pc:04x}: {name} {arg}'.rstrip())
            assert pc+width<=size,(method['name'],pc,op,width,size)
            pc+=width
        assert pc==size
        if tries:
            toff=off+16+2*size+(2 if size&1 else 0)
            for i in range(tries):
                start,count,handler=struct.unpack_from('<IHH',self.data,toff+8*i)
                lines.append(f'# try @{start:04x}..@{start+count:04x} handler_offset={handler}')
            ho=toff+8*tries;hc,cur=self.uleb(ho)
            for _ in range(hc):
                relative=cur-ho;hs,cur=self.sleb(cur);hspec=[]
                for _ in range(abs(hs)):
                    ti,cur=self.uleb(cur);addr,cur=self.uleb(cur);hspec.append(f'{self.types[ti]} -> @{addr:04x}')
                if hs<=0:
                    addr,cur=self.uleb(cur);hspec.append(f'catchall -> @{addr:04x}')
                lines.append(f'# handler_offset={relative}: '+', '.join(hspec))
        return lines


WIDTHS={'10x':1,'12x':1,'11n':1,'11x':1,'10t':1,'20t':2,'22x':2,'21t':2,'21s':2,'21h':2,'21c':2,'23x':2,'22b':2,'22t':2,'22s':2,'22c':2,'30t':3,'32x':3,'31i':3,'31t':3,'31c':3,'35c':3,'3rc':3,'51l':5}
OPS={}
def group(base,names,fmt):
    for i,n in enumerate(names.split()):OPS[base+i]=(n,fmt)
group(0,'nop','10x')
for base,prefix in [(1,'move'),(4,'move-wide'),(7,'move-object')]:
    group(base,prefix,'12x');group(base+1,prefix+'/from16','22x');group(base+2,prefix+'/16','32x')
group(0x0a,'move-result move-result-wide move-result-object move-exception','11x')
group(0x0e,'return-void','10x');group(0x0f,'return return-wide return-object','11x')
for op,n,fmt in [(0x12,'const/4','11n'),(0x13,'const/16','21s'),(0x14,'const','31i'),(0x15,'const/high16','21h'),(0x16,'const-wide/16','21s'),(0x17,'const-wide/32','31i'),(0x18,'const-wide','51l'),(0x19,'const-wide/high16','21h'),(0x1a,'const-string','21c'),(0x1b,'const-string/jumbo','31c'),(0x1c,'const-class','21c'),(0x1f,'check-cast','21c'),(0x20,'instance-of','22c'),(0x21,'array-length','12x'),(0x22,'new-instance','21c'),(0x23,'new-array','22c'),(0x24,'filled-new-array','35c'),(0x25,'filled-new-array/range','3rc'),(0x26,'fill-array-data','31t'),(0x27,'throw','11x'),(0x28,'goto','10t'),(0x29,'goto/16','20t'),(0x2a,'goto/32','30t'),(0x2b,'packed-switch','31t'),(0x2c,'sparse-switch','31t')]:OPS[op]=(n,fmt)
group(0x1d,'monitor-enter monitor-exit','11x')
group(0x2d,'cmpl-float cmpg-float cmpl-double cmpg-double cmp-long','23x')
group(0x32,'if-eq if-ne if-lt if-ge if-gt if-le','22t')
group(0x38,'if-eqz if-nez if-ltz if-gez if-gtz if-lez','21t')
group(0x44,'aget aget-wide aget-object aget-boolean aget-byte aget-char aget-short aput aput-wide aput-object aput-boolean aput-byte aput-char aput-short','23x')
group(0x52,'iget iget-wide iget-object iget-boolean iget-byte iget-char iget-short iput iput-wide iput-object iput-boolean iput-byte iput-char iput-short','22c')
group(0x60,'sget sget-wide sget-object sget-boolean sget-byte sget-char sget-short sput sput-wide sput-object sput-boolean sput-byte sput-char sput-short','21c')
group(0x6e,'invoke-virtual invoke-super invoke-direct invoke-static invoke-interface','35c')
group(0x74,'invoke-virtual/range invoke-super/range invoke-direct/range invoke-static/range invoke-interface/range','3rc')
group(0x7b,'neg-int not-int neg-long not-long neg-float neg-double int-to-long int-to-float int-to-double long-to-int long-to-float long-to-double float-to-int float-to-long float-to-double double-to-int double-to-long double-to-float int-to-byte int-to-char int-to-short','12x')
binary='add-int sub-int mul-int div-int rem-int and-int or-int xor-int shl-int shr-int ushr-int add-long sub-long mul-long div-long rem-long and-long or-long xor-long shl-long shr-long ushr-long add-float sub-float mul-float div-float rem-float add-double sub-double mul-double div-double rem-double'
group(0x90,binary,'23x');group(0xb0,' '.join(x+'/2addr' for x in binary.split()),'12x')
group(0xd0,'add-int/lit16 rsub-int mul-int/lit16 div-int/lit16 rem-int/lit16 and-int/lit16 or-int/lit16 xor-int/lit16','22s')
group(0xd8,'add-int/lit8 rsub-int/lit8 mul-int/lit8 div-int/lit8 rem-int/lit8 and-int/lit8 or-int/lit8 xor-int/lit8 shl-int/lit8 shr-int/lit8 ushr-int/lit8','22b')


