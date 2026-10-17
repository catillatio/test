#!/usr/bin/env python3
"""Decode the supplied Android binary XML and resource table, entirely offline."""
import json
import struct
from pathlib import Path
from xml.etree import ElementTree as ET
from dex_reader import ROOT, Dex

ANDROID='http://schemas.android.com/apk/res/android'
ET.register_namespace('android',ANDROID)
ET.register_namespace('app','http://schemas.android.com/apk/res-auto')

def u16(d,o):return struct.unpack_from('<H',d,o)[0]
def u32(d,o):return struct.unpack_from('<I',d,o)[0]

def chunks(d,start,end):
    while start<end:
        typ,head,size=struct.unpack_from('<HHI',d,start)
        assert size>=head>=8 and start+size<=end,(start,typ,head,size,end)
        yield start,typ,head,size
        start+=size
    assert start==end

def string_pool(d,off):
    n,styles,flags,sstart,ststart=struct.unpack_from('<5I',d,off+8)
    head=u16(d,off+2);utf8=flags&256
    def length(p):
        if utf8:
            x=d[p];p+=1
            if x&128:x=((x&127)<<8)|d[p];p+=1
        else:
            x=u16(d,p);p+=2
            if x&32768:x=((x&32767)<<16)|u16(d,p);p+=2
        return x,p
    out=[]
    for i in range(n):
        p=off+sstart+u32(d,off+head+4*i)
        nchar,p=length(p)
        if utf8:
            nb,p=length(p);out.append(d[p:p+nb].decode('utf-8','replace'))
        else:out.append(d[p:p+2*nchar].decode('utf-16le','replace'))
    return out

dex=Dex(ROOT/'extracted/classes.dex')
id_names={}
for c in dex.classes:
    if c['name'].startswith('Lcom/storm8/kingdoms12/R$'):
        typ=c['name'].split('R$')[1][:-1]
        for name,value in dex.static_values(c).items():
            if isinstance(value,int):id_names[value]=typ+'/'+name.split('->')[1].split(':')[0]

def typed(t,v,strings):
    if t==3:return strings[v]
    if t==1:return '@'+id_names.get(v,f'0x{v:08x}')
    if t==2:return '?'+id_names.get(v,f'0x{v:08x}')
    if t==18:return 'true' if v else 'false'
    if t==16:return str(v-(1<<32) if v&0x80000000 else v)
    if t==17:return f'0x{v:08x}'
    if 28<=t<=31:return f'#{v:08x}'
    if t==4:return str(struct.unpack('<f',struct.pack('<I',v))[0])
    if t in (5,6):
        value=(v&0xffffff00)*[1/(1<<8),1/(1<<15),1/(1<<23),1/(1<<31)][(v>>4)&3]
        if v&0x80000000:value-=((1<<32)*[1/(1<<8),1/(1<<15),1/(1<<23),1/(1<<31)][(v>>4)&3])
        if t==5:return f'{value:g}'+['px','dp','sp','pt','in','mm'][v&15]
        return f'{100*value:g}%'
    return f'{{type=0x{t:x},data=0x{v:08x}}}'

def decode_xml(path):
    d=path.read_bytes();assert u16(d,0)==3
    stack=[];root=None;ss=[]
    s=lambda i:'' if i==0xffffffff else ss[i]
    for off,typ,head,size in chunks(d,u16(d,2),u32(d,4)):
        if typ==1:ss=string_pool(d,off)
        elif typ==0x102:
            ns,name=u32(d,off+16),u32(d,off+20)
            tag=('{'+s(ns)+'}' if ns!=0xffffffff else '')+s(name)
            node=ET.Element(tag)
            astart,asize,acount=struct.unpack_from('<3H',d,off+24)
            for i in range(acount):
                a=off+16+astart+i*asize
                ans,an,raw=struct.unpack_from('<3I',d,a)
                key=('{'+s(ans)+'}' if ans!=0xffffffff else '')+s(an)
                val=s(raw) if raw!=0xffffffff else typed(d[a+15],u32(d,a+16),ss)
                node.set(key,val)
            if stack:stack[-1].append(node)
            else:root=node
            stack.append(node)
        elif typ==0x103:stack.pop()
        elif typ==0x104 and stack:stack[-1].text=s(u32(d,off+16))
    assert root is not None and not stack
    ET.indent(root)
    return ET.tostring(root,encoding='unicode')+'\n'

def decode_arsc(path):
    d=path.read_bytes();assert u16(d,0)==2
    ss=[];rows=[]
    for off,typ,head,size in chunks(d,u16(d,2),u32(d,4)):
        if typ==1:ss=string_pool(d,off)
        if typ!=0x200:continue
        pid=u32(d,off+8)
        package=d[off+12:off+268].decode('utf-16le').split('\0')[0]
        types=string_pool(d,off+u32(d,off+268))
        keys=string_pool(d,off+u32(d,off+276))
        toffset=u32(d,off+284) if head>=288 else 0
        for ch,ct,hh,sz in chunks(d,off+head,off+size):
            if ct!=0x201:continue
            tid=d[ch+8]+toffset;flags=d[ch+9];count=u32(d,ch+12);estart=u32(d,ch+16)
            assert flags==0,('unsupported sparse table',flags)
            config=d[ch+20:ch+hh].hex()
            for i in range(count):
                rel=u32(d,ch+hh+4*i)
                if rel==0xffffffff:continue
                ep=ch+estart+rel;esize,eflags,key=struct.unpack_from('<HHI',d,ep)
                rid=(pid<<24)|(tid<<16)|i
                row={'id':f'0x{rid:08x}','package':package,'type':types[tid-toffset-1],'name':keys[key],'config_hex':config}
                if eflags&1:
                    row['parent']=f'0x{u32(d,ep+8):08x}';row['items']=[]
                    for j in range(u32(d,ep+12)):
                        mp=ep+esize+12*j
                        row['items'].append({'name':f'0x{u32(d,mp):08x}','value':typed(d[mp+7],u32(d,mp+8),ss)})
                else:
                    vp=ep+esize;row['value']=typed(d[vp+3],u32(d,vp+4),ss)
                rows.append(row)
    return rows

