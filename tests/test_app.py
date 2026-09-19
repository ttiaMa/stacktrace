import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from app.config import ConfigError, load, normalize
from app import server
ROOT = Path(__file__).resolve().parents[1]

class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.base = {'version':1,'models':{'m':{'name':'Anything'}},'harnesses':{'h':{'name':'My harness'}},'entries':[{'id':'one','title':'Example','start':'2026-01-01','model':'m'}]}
    def test_open_interval_and_free_catalog(self):
        result=normalize(self.base)
        self.assertIsNone(result['entries'][0]['end'])
        self.assertEqual(result['models']['m']['name'],'Anything')
    def test_direct_names_and_version_identity(self):
        raw = {'version':1, 'categories':{'code':'Code'}, 'entries':[
            {'id':'a','title':'First','start':'2026-01-01','model':'GPT Sol 5.6','harness':'Pi','category':'code'},
            {'id':'b','title':'Next','start':'2026-02-01','models':[{'model':'GPT Sol 5.6','role':'Light'}, {'model':'Claude Opus 5'}]}]}
        result = normalize(raw)
        self.assertEqual(len(result['models']), 2)
        self.assertEqual(result['entries'][0]['model'], result['entries'][1]['models'][0]['model'])
        self.assertEqual(result['categories']['code']['name'], 'Code')
        self.assertEqual(next(iter(result['harnesses'].values()))['name'], 'Pi')
    def test_harness_only_and_overlap(self):
        self.base['entries'].append({'id':'two','title':'Harness only','start':'2026-01-01','harness':'h'})
        self.assertEqual(len(normalize(self.base)['entries']),2)
    def test_multiple_models_share_one_period(self):
        entry = self.base['entries'][0]
        entry.pop('model')
        entry.update(harness='h', models=[{'model':'m','role':'Light coding'}, {'model':'m','role':'Heavy coding'}])
        result = normalize(self.base)['entries']
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['models'][1], {'model':'m','role':'Heavy coding'})
        self.assertEqual(result[0]['harness'], 'h')
    def test_reject_invalid_multiple_models(self):
        self.base['entries'][0].pop('model')
        for refs in [[], 'm', ['m'], [{'model':'missing'}], [{'model':'m','role':''}], [{'model':'m','unknown':True}], [{'model':'m'}]*31]:
            with self.subTest(refs=refs):
                self.base['entries'][0]['models'] = refs
                with self.assertRaises(ConfigError): normalize(self.base)
        self.base['entries'][0].update(model='m', models=[{'model':'m'}])
        with self.assertRaises(ConfigError): normalize(self.base)
    def test_date_validation(self):
        for start,end in [('2026-02-30',None),('01-01-2026',None),('2026-01-02','2026-01-01')]:
            with self.subTest(start=start,end=end):
                self.base['entries'][0].update(start=start,end=end)
                with self.assertRaises(ConfigError): normalize(self.base)
    def test_reference_and_duplicates(self):
        self.base['entries'][0]['model']='unknown'
        with self.assertRaises(ConfigError): normalize(self.base)
        self.base['entries'][0]['model']='m'
        self.base['entries'].append(copy.deepcopy(self.base['entries'][0]))
        with self.assertRaises(ConfigError): normalize(self.base)
    def test_url_and_color_injection(self):
        self.base['entries'][0]['url']='javascript:alert(1)'
        with self.assertRaises(ConfigError): normalize(self.base)
        self.base['entries'][0].pop('url')
        self.base['models']['m']['color']='red;display:none'
        with self.assertRaises(ConfigError): normalize(self.base)
    def test_unknown_field(self):
        self.base['entries'][0]['modle']='m'
        with self.assertRaises(ConfigError): normalize(self.base)
    def test_reject_alias_duplicate_and_python_object(self):
        for content in ['version: 1\nversion: 1','x: &x [a]\ny: *x','!!python/object/apply:os.system [echo bad]']:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'invalid.yaml'
                path.write_text(content, encoding='utf-8')
                with self.assertRaises(ConfigError): load(path)
    def test_example_native_dates(self):
        result,revision=load(ROOT/'config/timeline.yaml')
        self.assertEqual(result['entries'][0]['start'],'2023-04-01')
        self.assertEqual(len(revision),64)
    def test_size_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'large.yaml'
            path.write_text('x'*1_048_577, encoding='utf-8')
            with self.assertRaises(ConfigError): load(path)

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.path=Path(self.directory.name)/'timeline.yaml'
        self.path.write_text((ROOT/'config/timeline.yaml').read_text())
        self.patcher=patch.object(server,'CONFIG',self.path);self.patcher.start()
        server.last_good=None;server.last_error=None
    def tearDown(self):
        self.patcher.stop();self.directory.cleanup()
    def request(self,path,method='GET'):
        response={}
        def start(status,headers): response.update(status=status,headers=dict(headers))
        response['body']=b''.join(server.application({'PATH_INFO':path,'REQUEST_METHOD':method},start))
        return response
    def test_routes_readonly(self):
        self.assertEqual(self.request('/')['status'],'200 OK')
        self.assertEqual(self.request('/api/timeline','POST')['status'],'405 Method Not Allowed')
        for route in ['/config/timeline.yaml','/../requirements.txt','/.env']:
            self.assertEqual(self.request(route)['status'],'404 Not Found')
    def test_head_headers(self):
        response=self.request('/','HEAD')
        self.assertEqual(response['body'],b'')
        self.assertGreater(int(response['headers']['Content-Length']),0)
        self.assertIn("script-src 'self'",response['headers']['Content-Security-Policy'])
    def test_reload_fallback_recovery(self):
        initial=json.loads(self.request('/api/timeline')['body'])
        self.path.write_text('version: [broken')
        stale=json.loads(self.request('/api/timeline')['body'])
        self.assertTrue(stale['stale']);self.assertEqual(initial['entries'],stale['entries'])
        self.assertEqual(self.request('/healthz')['status'],'503 Service Unavailable')
        self.path.write_text('version: 1\nentries: []')
        recovered=json.loads(self.request('/api/timeline')['body'])
        self.assertFalse(recovered['stale']);self.assertEqual(recovered['entries'],[])
        self.assertEqual(self.request('/healthz')['status'],'200 OK')
    def test_invalid_startup_no_leak(self):
        self.path.unlink();response=self.request('/api/timeline')
        self.assertEqual(response['status'],'503 Service Unavailable')
        self.assertNotIn(str(self.path).encode(),response['body'])
if __name__=='__main__': unittest.main()
