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

class ImportRows(unittest.TestCase):
 def read(self, rows):
  from tempfile import TemporaryDirectory
  from zipfile import ZipFile
  ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  headers=['模式名称','diag.name','模式所属来源','风险实例','检测结果','是否为风险实例']
  head=''.join(f'<c r="{chr(65+i)}1" t="inlineStr"><is><t>{x}</t></is></c>' for i,x in enumerate(headers))
  with TemporaryDirectory() as d:
   p=Path(d)/'test.xlsx'
   with ZipFile(p,'w') as z:
    z.writestr('xl/styles.xml',f'<styleSheet xmlns="{ns}"><fills/><cellXfs/></styleSheet>')
    z.writestr('xl/theme/theme1.xml','<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:clrScheme/></a:theme>')
    z.writestr('xl/workbook.xml',f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="test" r:id="r1"/></sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>')
    z.writestr('xl/worksheets/sheet1.xml',f'<worksheet xmlns="{ns}"><sheetData><row r="1">{head}</row>{rows}</sheetData></worksheet>')
   return m.read_rows(p)
 def test_blank_rows_skipped(self):
  self.assertEqual(self.read('<row r="2"/><row r="3"><c r="A3" t="inlineStr"><is><t>  </t></is></c></row>')[1],[])
 def test_nonempty_row_missing_name_rejected(self):
  with self.assertRaisesRegex(ValueError,'第 2 行缺少 模式名称'):
   self.read('<row r="2"><c r="D2" t="inlineStr"><is><t>tests/ui/case.rs</t></is></c></row>')
