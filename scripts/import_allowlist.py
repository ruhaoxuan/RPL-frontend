"""Import an explicit white-row allowlist from the project's XLSX (stdlib only)."""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import argparse, datetime, hashlib, json, re, subprocess

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'

def fill_kind(fill, theme):
    pattern = fill.find('m:patternFill', NS)
    if pattern is None or pattern.get('patternType', 'none') == 'none': return 'white'
    if pattern.get('patternType') != 'solid': raise ValueError('不支持的底色样式')
    fg = pattern.find('m:fgColor', NS)
    if fg is None: raise ValueError('填充缺少颜色')
    if 'rgb' in fg.attrib: color = fg.get('rgb')[-6:].upper()
    elif 'theme' in fg.attrib: color = theme[int(fg.get('theme'))]
    else: raise ValueError('不支持的颜色来源')
    tint = float(fg.get('tint', '0'))
    if color == 'FFFFFF' and tint == 0: return 'white'
    if (color == 'ED7D31' and abs(tint - .59999389629810485) < .00001) or (color == 'F8CBAD' and tint == 0): return 'orange'
    raise ValueError(f'未知颜色 {color}, tint={tint}，请核查而非默认允许')

def safe_path(value, prefix, suffix):
    value = value.strip().replace('\\', '/')
    p = PurePosixPath(value)
    if p.is_absolute() or '..' in p.parts or ':' in value: raise ValueError(f'非法路径 {value}')
    value = str(p)
    if not value.startswith(prefix): value = prefix + value
    if not value.endswith(suffix): raise ValueError(f'扩展名错误 {value}')
    return value

def read_rows(file):
    with ZipFile(file) as z:
        styles = ET.fromstring(z.read('xl/styles.xml'))
        fills = styles.find('m:fills', NS); xfs = styles.find('m:cellXfs', NS)
        scheme = ET.fromstring(z.read('xl/theme/theme1.xml')).find('.//' + A + 'clrScheme')
        theme = [list(e)[0].get('val') or list(e)[0].get('lastClr') for e in scheme]
        strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in z.namelist() else []
        wb = ET.fromstring(z.read('xl/workbook.xml')); sheets = wb.find('m:sheets', NS)
        if len(sheets) != 1: raise ValueError('工作簿需恰有一张工作表，避免选择歧义')
        relation = list(sheets)[0].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target = next(r.get('Target') for r in rels if r.get('Id') == relation)
        sheet_path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        sheet = ET.fromstring(z.read(sheet_path))
        if sheet.findall('m:conditionalFormatting', NS) or sheet.findall('m:mergeCells/m:mergeCell', NS): raise ValueError('检测到条件格式或合并，需重新核查颜色规则')
        all_rows = sheet.findall('m:sheetData/m:row', NS)
        def values(row):
            result = {}
            for c in row.findall('m:c', NS):
                col = re.sub(r'\d', '', c.get('r')); value = c.find('m:v', NS)
                if value is not None: text = strings[int(value.text)] if c.get('t') == 's' else value.text or ''
                else: text = ''.join(c.find('m:is', NS).itertext()) if c.find('m:is', NS) is not None else ''
                if text and text.strip(): result[col] = (text.strip(), c)
            return result
        header = {text: col for col, (text, _) in values(all_rows[0]).items()}
        required = ['模式名称', 'diag.name', '模式所属来源', '风险实例', '检测结果', '是否为风险实例']
        if not all(h in header for h in required): raise ValueError('缺少必需列')
        result = []
        for row in all_rows[1:]:
            cells = values(row)
            if not cells: continue
            for name in ['模式名称', 'diag.name', '模式所属来源', '风险实例', '是否为风险实例']:
                if header[name] not in cells:
                    raise ValueError(f'第 {row.get("r")} 行缺少 {name}')
            v = {name: cells.get(col, ('', None))[0] for name, col in header.items()}
            kinds = []
            for name in ['模式名称', '风险实例', '模式所属来源', '是否为风险实例']:
                cell = cells.get(header[name], ('', None))[1]
                if cell is None: raise ValueError(f'第 {row.get("r")} 行缺少 {name}')
                kinds.append(fill_kind(fills[int(xfs[int(cell.get('s','0'))].get('fillId','0'))], theme))
            if len(set(kinds)) != 1: raise ValueError(f'第 {row.get("r")} 行核心颜色不一致')
            result.append({'row': int(row.get('r')), 'color': kinds[0], 'values': v})
        return list(sheets)[0].get('name'), result

def digest(file): return hashlib.sha256(file.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--input', required=True); args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]; source = root/'vendor/RPL'; workbook = Path(args.input).resolve()
    sheet_name, rows = read_rows(workbook)
    pairs, excluded, missing = [], [], []; seen = {}
    for row in rows:
        v = row['values']; category = v['模式所属来源']
        if category not in ['clippy','codeql','cve','ub']: raise ValueError('未知来源 '+category)
        name = v['模式名称']
        if '/' in name or '\\' in name or name in ['.','..']: raise ValueError('非法模式名称')
        pattern = safe_path(f'{category}/{name}.rpl','docs/patterns-pest/','.rpl')
        instance = safe_path(v['风险实例'],'tests/ui/','.rs')
        item = {'spreadsheetRow': row['row'], 'patternId': f'{category}/{name}', 'patternFile': pattern, 'instanceFile': instance}
        if row['color'] == 'orange': excluded.append(item); continue
        risk = v['是否为风险实例']
        if risk not in ['0','1']: raise ValueError(f'第 {row["row"]} 行风险标记无效')
        if not (source/pattern).is_file() or not (source/instance).is_file(): raise ValueError(f'第 {row["row"]} 行文件不存在')
        baselines = [safe_path(p,'tests/ui/','.stderr') for p in re.split('[、,，;；\n]+', v['检测结果']) if p.strip()]
        for b in baselines:
            if not (source/b).is_file(): missing.append({'row':row['row'],'path':b})
        item.update(id='pair-'+hashlib.sha256((pattern+'\0'+instance).encode()).hexdigest()[:16],diagNames=sorted(set(x.strip() for x in re.split('[、,，;；\n]+',v['diag.name']) if x.strip())),type='positive' if risk=='1' else 'negative',expectedResult='match' if risk=='1' else 'no_match',baselineFiles=baselines,note=v.get('说明',''),patternSha256=digest(source/pattern),instanceSha256=digest(source/instance))
        key = (pattern, instance)
        if key in seen:
            old = seen[key]
            if any(old[x]!=item[x] for x in ['type','diagNames','baselineFiles']): raise ValueError(f'重复关联存在冲突：第 {old["spreadsheetRow"]}/{row["row"]} 行')
            continue
        seen[key]=item; pairs.append(item)
    if any((x['patternFile'],x['instanceFile']) in seen for x in excluded): raise ValueError('白色和橙色关联冲突')
    manifest={'schemaVersion':1,'sourceWorkbook':workbook.name,'workbookSha256':digest(workbook),'sheetName':sheet_name,'importedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewedSourceCommit':subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip(),'pairs':pairs,'excludedPairs':excluded,'missingBaselines':missing}
    out=root/'metadata/allowed-pairs.json';out.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'已导入白色 {len(pairs)} 对，排除橙色 {len(excluded)} 对，模式 {len(set(p["patternId"] for p in pairs))} 条，缺失基准 {len(missing)} 份。')

if __name__ == '__main__': main()
