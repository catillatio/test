import hashlib, importlib.util, json, unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish.py'))
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)

class RegistryBinding(unittest.TestCase):
    def setUp(self):
        self.config = 'sha256:' + 'a' * 64
        self.value = {'schemaVersion': 2, 'mediaType': p.MEDIA[0], 'config': {'digest': self.config}, 'layers': [{'digest': 'sha256:' + 'b' * 64}]}
    def validate(self, value=None, header=None, digest=None, config=None):
        raw = json.dumps(value or self.value).encode()
        actual = 'sha256:' + hashlib.sha256(raw).hexdigest()
        return p.manifest(raw, header or actual, digest or actual, config or self.config)
    def test_real_single_platform_shape(self): self.assertEqual(self.validate(), self.value)
    def test_oci_single_platform_shape(self): self.value['mediaType'] = p.MEDIA[1]; self.validate()
    def test_wrong_header(self):
        with self.assertRaises(AssertionError): self.validate(header='sha256:' + 'c' * 64)
    def test_wrong_manifest_bytes(self):
        with self.assertRaises(AssertionError): self.validate(header='sha256:' + 'c' * 64, digest='sha256:' + 'c' * 64)
    def test_config_is_not_manifest_digest(self):
        with self.assertRaises(AssertionError): self.validate(config='sha256:' + 'c' * 64)
    def test_manifest_index_rejected(self):
        self.value.update({'mediaType': 'application/vnd.oci.image.index.v1+json', 'manifests': []})
        with self.assertRaises(AssertionError): self.validate()
    def test_extra_layers_rejected(self):
        self.value['layers'] *= 2
        with self.assertRaises(AssertionError): self.validate()
    def test_wrong_platform_or_user_rejected(self):
        base = {'Id': self.config, 'Os': 'linux', 'Architecture': 'amd64', 'Config': {'User': '65532:65532', 'Entrypoint': ['/canary'], 'Env': ['PATH=/bin', 'PORT=8080']}}
        p.platform(base, self.config)
        for key, value in [('Architecture', 'arm64'), ('Os', 'windows'), ('Id', 'sha256:' + 'c' * 64)]:
            wrong = {**base, key: value}
            with self.assertRaises(AssertionError): p.platform(wrong, self.config)
        for field, value in [('User', '0'), ('Entrypoint', ['/shell']), ('Env', ['PORT=8080', 'TOKEN=synthetic'])]:
            wrong = {**base, 'Config': {**base['Config'], field: value}}
            with self.assertRaises(AssertionError): p.platform(wrong, self.config)

if __name__ == '__main__': unittest.main()
