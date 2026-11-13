import importlib.util
from pathlib import Path
import unittest
from xml.etree import ElementTree as ET
spec=importlib.util.spec_from_file_location('importer',Path(__file__).resolve().parents[1]/'scripts/import_allowlist.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ImportSafety(unittest.TestCase):
 def fill(self,body):return ET.fromstring('<fill xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+body+'</fill>')
 def test_white_orange(self):
  self.assertEqual(m.fill_kind(self.fill('<patternFill patternType="none"/>'),[]),'white')
  self.assertEqual(m.fill_kind(self.fill('<patternFill patternType="solid"><fgColor theme="5" tint="0.59999389629810485"/></patternFill>'),['FFFFFF']*5+['ED7D31']),'orange')
 def test_unknown_color(self):
  with self.assertRaises(ValueError):m.fill_kind(self.fill('<patternFill patternType="solid"><fgColor rgb="FF00FF00"/></patternFill>'),[])
 def test_paths(self):
  self.assertEqual(m.safe_path('cve/a.rs','tests/ui/','.rs'),'tests/ui/cve/a.rs')
  for value in ['../../a.rs','/etc/a.rs','C:/a.rs','x.txt']:
   with self.subTest(value=value),self.assertRaises(ValueError):m.safe_path(value,'tests/ui/','.rs')
