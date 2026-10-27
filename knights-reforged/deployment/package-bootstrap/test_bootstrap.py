import hashlib,json,unittest
import bootstrap as b
class Policy(unittest.TestCase):
 def test_private_metadata(self):
  self.assertEqual(b.privacy_metadata(200,json.dumps({'name':'kingdom-come','package_type':'container','visibility':'private'}).encode()),'PRIVATE')
 def test_public_never_accepted(self):
  self.assertEqual(b.privacy_metadata(200,json.dumps({'name':'kingdom-come','package_type':'container','visibility':'public'}).encode()),'NOT_PRIVATE')
 def test_unknown_never_accepted(self):
  for status in [401,403,404,500]:self.assertEqual(b.privacy_metadata(status,b''),'UNVERIFIED')
 def test_wrong_package_rejected(self):
  with self.assertRaises(AssertionError):b.privacy_metadata(200,b'{"name":"other","package_type":"container","visibility":"private"}')
 def test_manifest(self):
  value={'schemaVersion':2,'mediaType':b.MEDIA.split(', ')[0],'config':{'digest':b.CONFIG},'layers':[{'digest':'sha256:'+'1'*64,'size':1000}]}
  raw=json.dumps(value).encode();d='sha256:'+hashlib.sha256(raw).hexdigest();self.assertEqual(b.manifest(raw,d,d),value)
  for data,header in [(raw+b' ',d),(raw,'sha256:'+'2'*64)]:
   with self.assertRaises(AssertionError):b.manifest(data,header,d)
 def test_other_image_config_rejected(self):
  with self.assertRaises(AssertionError):b.platform({'Id':'sha256:'+'f'*64})
 def test_wrong_synthetic_identity_rejected(self):
  with self.assertRaises(AssertionError):b.result({'kind':'kingdom-come-game'})
 def test_target_fixed(self):
  self.assertEqual(b.PACKAGE,'ghcr.io/catillatio/kingdom-come');self.assertIn('@sha256:',b.SOURCE)
if __name__=='__main__':unittest.main()
