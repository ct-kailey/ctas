"""Render a bounded domain-guide snapshot. All user strings are inert plain text.

Only the two application-generated local paths in argv are used. No URL, image,
HTML, template, font path or shell command is accepted from the JSON payload.
"""
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys
from xml.sax.saxutils import escape

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, PageBreak, CondPageBreak,
        Table, LongTable, TableStyle, Flowable, KeepTogether,
    )
except ImportError:
    print(json.dumps({"code": "DEPENDENCY_MISSING"}), file=sys.stderr)
    sys.exit(2)

FONT_PATHS = [
    ('/usr/share/fonts/truetype/nanum/NanumGothic.ttf', '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf'),
    ('/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf', '/usr/share/fonts/truetype/nanum/NanumBarunGothicBold.ttf'),
    ('/Library/Fonts/Arial Unicode.ttf', '/Library/Fonts/Arial Unicode.ttf'),
    ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'),
    ('/System/Library/Fonts/Supplemental/AppleGothic.ttf', '/System/Library/Fonts/Supplemental/AppleGothic.ttf'),
]
INK = colors.HexColor('#1E322C')
MUTED = colors.HexColor('#5A6B63')
LINE = colors.HexColor('#D9E2DC')
PAPER = colors.HexColor('#F3F6F2')
GREEN = colors.HexColor('#315B48')
AMBER = colors.HexColor('#7C5A1F')
WHITE = colors.white
WIDTH = A4[0] - 40 * mm


def fonts():
    for regular, bold in FONT_PATHS:
        if Path(regular).is_file():
            try:
                pdfmetrics.registerFont(TTFont('Guide', regular))
                pdfmetrics.registerFont(TTFont('GuideBold', bold if Path(bold).is_file() else regular))
                pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='GuideBold', italic='Guide', boldItalic='GuideBold')
                return
            except Exception:
                continue
    raise RuntimeError('KOREAN_FONT_MISSING')


def clean(value):
    text = str(value if value is not None else '')
    for dash in ('\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2212'):
        text = text.replace(dash, '-')
    glyphs = pdfmetrics.getFont('Guide').face.charWidths
    return ''.join(c if ord(c) in glyphs or c in '\n\t\r' else '?' for c in text if c in '\n\t\r' or (ord(c) >= 32 and ord(c) not in (0xfffe, 0xffff) and not 0xd800 <= ord(c) <= 0xdfff))


def text(value):
    return escape(clean(value)).replace('\n', '<br/>')


def date(value):
    if not value:
        return '일자 미기록'
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone(timedelta(hours=9))).strftime('%Y.%m.%d %H:%M')
    except (ValueError, TypeError):
        return '일자 미기록'


def styles():
    base = dict(fontName='Guide', textColor=INK, wordWrap='CJK', splitLongWords=True, allowWidows=0, allowOrphans=0)
    return {
        'title': ParagraphStyle('title', **base, fontSize=26, leading=37, spaceAfter=16),
        'subtitle': ParagraphStyle('subtitle', **base, fontSize=13, leading=20, spaceAfter=12),
        'body': ParagraphStyle('body', **base, fontSize=10, leading=16, spaceAfter=8),
        'small': ParagraphStyle('small', **base, fontSize=8.1, leading=12, spaceAfter=5),
        'caption': ParagraphStyle('caption', **{**base, 'textColor': MUTED}, fontSize=8, leading=12, spaceAfter=7),
        'h1': ParagraphStyle('h1', **base, fontSize=17, leading=24, spaceBefore=16, spaceAfter=12, keepWithNext=True),
        'h2': ParagraphStyle('h2', **base, fontSize=12, leading=18, spaceBefore=10, spaceAfter=7, keepWithNext=True),
        'node': ParagraphStyle('node', **base, fontSize=8.8, leading=12, alignment=1, spaceAfter=0),
        'cell': ParagraphStyle('cell', **base, fontSize=9, leading=14, spaceAfter=0),
        'number': ParagraphStyle('number', **{**base, 'textColor': GREEN}, fontSize=9, leading=14, spaceAfter=0),
    }


def para(value, style='body'):
    return Paragraph(text(value), STYLES[style])


def paragraphs(value, style='body'):
    # Individual paragraphs can split across pages; huge source paragraphs are
    # subdivided without losing text to avoid a single unsplittable table cell.
    result = []
    for line in str(value or '').split('\n'):
        if not line.strip():
            result.append(Spacer(1, 5))
        else:
            for offset in range(0, len(line), 1800):
                result.append(para(line[offset:offset + 1800], style))
    return result


def table(rows, widths, header=False):
    # Keep ordinary glossary rows together. Only a row taller than a fresh page
    # may split within a cell; otherwise ReportLab can repeat a header mid-page.
    def cell_height(cell, width):
        values = cell if isinstance(cell, list) else [cell]
        return sum(item.wrap(width - 20, 100000)[1] + getattr(item, 'spaceAfter', 0) for item in values)
    tall_row = any(max(cell_height(cell, width) for cell, width in zip(row, widths)) > 600 for row in rows)
    value = LongTable(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign='LEFT', splitByRow=1, splitInRow=1 if tall_row else 0)
    commands = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8), ('LINEBELOW', (0, 0), (-1, -1), 0.45, LINE)]
    if header:
        commands.append(('BACKGROUND', (0, 0), (-1, 0), PAPER))
    value.setStyle(TableStyle(commands))
    return value


def clipped(value, limit):
    value = clean(value)
    return value if len(value) <= limit else value[:limit - 3] + '...'


def arrow(canvas, points, color=GREEN, dashed=False):
    canvas.saveState()
    canvas.setStrokeColor(color)
    canvas.setFillColor(color)
    canvas.setLineWidth(0.9)
    if dashed:
        canvas.setDash(3, 2)
    path = canvas.beginPath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    canvas.drawPath(path)
    canvas.setDash()
    start, end = points[-2:]
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    path = canvas.beginPath()
    path.moveTo(*end)
    for turn in (-0.42, 0.42):
        path.lineTo(end[0] - 5 * math.cos(angle + turn), end[1] - 5 * math.sin(angle + turn))
    path.close()
    canvas.drawPath(path, stroke=0, fill=1)
    canvas.restoreState()


class WorkflowDiagram(Flowable):
    """Small native vector graph; long graphs continue with numbered step links."""
    def __init__(self, flow, start, stop):
        super().__init__()
        self.flow, self.start, self.stop = flow, start, stop
        self.width, self.height = WIDTH, (stop - start) * 91 + 20

    def draw(self):
        canvas = self.canv
        nodes = self.flow['nodes']
        lookup = {node['id']: index for index, node in enumerate(nodes)}
        center, half = self.width / 2, 132
        points = {index: self.height - 45 - (index - self.start) * 91 for index in range(self.start, self.stop)}
        for edge_no, edge in enumerate(self.flow['edges']):
            source, target = lookup[edge['from']], lookup[edge['to']]
            if source not in points:
                continue
            sy = points[source]
            if target in points and target == source + 1:
                source_height = 36 if nodes[source]['kind'] == 'decision' else 28
                target_height = 36 if nodes[target]['kind'] == 'decision' else 28
                arrow(canvas, [(center, sy - source_height), (center, points[target] + target_height + 1)])
                if edge['label']:
                    canvas.setFont('Guide', 7.5); canvas.setFillColor(MUTED)
                    canvas.drawString(center + 7, sy - 45, clipped(edge['label'], 15))
            else:
                right = target > source
                lane = center + half + 20 + (edge_no % 3) * 12 if right else center - half - 20 - (edge_no % 3) * 12
                x = center + half if right else center - half
                if target in points:
                    ey = points[target]
                    arrow(canvas, [(x, sy), (lane, sy), (lane, ey), (x, ey)], MUTED)
                else:
                    arrow(canvas, [(x, sy), (lane, sy)], MUTED, dashed=True)
                canvas.setFont('Guide', 7)
                canvas.setFillColor(MUTED)
                condition = clipped(edge.get('label', '').split(' ')[0], 5)
                label = (condition + ' ' if condition else '') + f'{source + 1:02d}>{target + 1:02d}'
                canvas.drawString(lane + 3 if right else 2, sy + 7, label)
        for index, y in points.items():
            node = nodes[index]
            canvas.setFillColor(PAPER if node['kind'] != 'decision' else colors.HexColor('#FBF5E8'))
            canvas.setStrokeColor(LINE if node['kind'] != 'decision' else colors.HexColor('#DDC795'))
            canvas.setLineWidth(0.8)
            if node['kind'] == 'decision':
                path = canvas.beginPath()
                path.moveTo(center - half, y); path.lineTo(center, y + 36)
                path.lineTo(center + half, y); path.lineTo(center, y - 36); path.close()
                canvas.drawPath(path, stroke=1, fill=1)
                label_width, limit = 170, 32
            else:
                canvas.roundRect(center - half, y - 28, half * 2, 56, 25 if node['kind'] in ('start', 'end') else 5, stroke=1, fill=1)
                label_width, limit = 244, 85
            p = para(f'{index + 1:02d}  {clipped(node["label"], limit)}', 'node')
            _, h = p.wrap(label_width, 56)
            p.drawOn(canvas, center - label_width / 2, y - h / 2)


def render(data, output):
    version = data['version']; guide = version['guide']; project = data.get('project') or {}
    sources = version['snapshot']['sources']
    numbers = {source['id']: index + 1 for index, source in enumerate(sources)}
    def citations(ids):
        return '근거 ' + ', '.join(f'[{numbers[source_id]}]' for source_id in dict.fromkeys(ids) if source_id in numbers) if ids else '직접 연결된 근거 없음 · 추가 확인 필요'
    def evidence(ids):
        return para(citations(ids), 'caption')
    approved = version.get('status') in ('approved', 'published')
    rejected = version.get('status') == 'rejected'
    stale = version.get('stale') is True
    badge = 'APPROVED · 검토 승인본' if approved else 'REJECTED · 검토 반려' if rejected else 'DRAFT · 검토 전 초안'
    revision = f'v{version.get("number") or version.get("version_number") or 1}'
    reviewed_at = version.get('reviewed_at') or version.get('published_at')
    created = date(version.get('created_at'))
    as_of = max((str(s.get('occurred_at') or '') for s in sources), default='')
    doc = SimpleDocTemplate(str(output), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm, title=clean(guide['title']), author='AINS', subject=badge, pageCompression=1)
    def page(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5)
        canvas.line(20 * mm, A4[1] - 13 * mm, A4[0] - 20 * mm, A4[1] - 13 * mm)
        canvas.setFont('Guide', 8); canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, A4[1] - 10 * mm, 'AINS / ' + clipped(project.get('name') or '프로젝트 도메인 가이드', 42))
        canvas.drawRightString(A4[0] - 20 * mm, A4[1] - 10 * mm, revision + ' · ' + ('검토 승인' if approved else '반려' if rejected else 'DRAFT') + (' · 근거 재확인' if stale else ''))
        canvas.line(20 * mm, 14 * mm, A4[0] - 20 * mm, 14 * mm)
        canvas.setFont('Guide', 7)
        canvas.drawString(20 * mm, 10 * mm, '생성 ' + created + ' KST · 근거는 생성 시점 스냅샷')
        canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, str(document.page))
        canvas.restoreState()

    story = [Spacer(1, 9 * mm), para(badge, 'caption'), para(project.get('name') or '프로젝트', 'subtitle'), para(guide['title'], 'title')]
    if stale:
        story.append(para('근거 최신성 재확인 필요', 'h2'))
        story.append(para('현재 근거와의 일치가 확인되지 않은 버전입니다. 최신 자료로 가이드를 다시 생성하거나 담당자가 변경 내용을 재검토하세요.', 'body'))
    if rejected:
        story.append(para('검토에서 반려된 자료입니다. 승인된 정책 안내나 현재 업무 기준으로 사용하지 마세요.', 'body'))
    elif not approved:
        story.append(para('담당자 검토 전 자료입니다. 확정 정책과 참고 자료를 구분해 읽고, 미확정 사항은 확인 후 사용하세요.', 'body'))
    story.extend(paragraphs(guide['summary']))
    story.append(evidence(guide['summary_evidence_ids']))
    story.append(Spacer(1, 10))
    facts = [
        [para('문서 버전', 'small'), para(revision, 'small')],
        [para('생성 일시', 'small'), para(created + ' KST', 'small')],
        [para('최신 근거 일시', 'small'), para(date(as_of) + (' KST' if as_of else ''), 'small')],
        [para('검토 상태', 'small'), para(('승인 ' if approved else '반려 ') + date(reviewed_at) + ' KST' if (approved or rejected) and reviewed_at else badge, 'small')],
        [para('근거 최신성', 'small'), para('재확인 필요 · 현재 근거와 불일치 또는 확인 불가' if stale else '다운로드 시점의 근거 확인 상태를 기준으로 합니다.', 'small')],
        [para('참고한 자료', 'small'), para(f'{len(sources)}개 · 본문 [번호]로 원본 근거 목록과 연결', 'small')],
    ]
    story.append(table(facts, [100, WIDTH - 100]))
    story.extend([Spacer(1, 14), para('읽는 순서', 'h2'), para('01 도메인 이해와 정책   /   02 용어 사전   /   03 업무 흐름\n04 최근 변경사항   /   05 확인할 질문   /   06 근거 자료', 'small'), PageBreak()])
    story.append(para('01  도메인 이해와 정책', 'h1'))
    statuses = {'confirmed': '확정 근거', 'reference': '참고 내용', 'needs_confirmation': '확인 필요'}
    for section in guide['sections']:
        story.extend([para(section['title'], 'h2'), para(statuses[section['status']] + ' · ' + citations(section['evidence_ids']), 'caption')])
        story.extend(paragraphs(section['body']))
    if not guide['sections']:
        story.append(para('정리된 도메인 설명이 없습니다. 연결한 기획 문서와 정책 자료를 보완하세요.'))
    story.extend([CondPageBreak(100), para('02  용어 사전', 'h1')])
    if guide['glossary']:
        rows = [[para('용어', 'small'), para('뜻과 사용 맥락', 'small')]]
        for term in guide['glossary']:
            rows.append([para(term['term'], 'cell'), paragraphs(term['definition'], 'cell') + [evidence(term['evidence_ids'])]])
        story.append(table(rows, [WIDTH * .25, WIDTH * .75], header=True))
    else:
        story.append(para('별도로 정리된 용어가 없습니다.'))
    story.extend([PageBreak(), para('03  업무 흐름', 'h1'), para('둥근 도형: 시작·종료  /  사각형: 처리  /  마름모: 판단\n화살표는 실제 연결을 따릅니다. 분기 조건과 되돌아가는 단계는 아래 연결 설명에서 확인하세요.', 'caption')])
    for flow in guide['workflows']:
        story.extend([para(flow['title'], 'h2'), evidence(flow['evidence_ids'])])
        for start in range(0, len(flow['nodes']), 5):
            stop = min(start + 5, len(flow['nodes']))
            if start:
                story.append(PageBreak())
                story.append(para(flow['title'] + ' · 이어지는 흐름', 'h2'))
            story.append(WorkflowDiagram(flow, start, stop))
            if stop < len(flow['nodes']):
                story.append(para(f'다음 페이지에 {stop + 1:02d}번 이후 단계가 있습니다. 실제 이동 대상은 화살표와 분기·연결 설명을 확인하세요.', 'caption'))
        lookup = {node['id']: index + 1 for index, node in enumerate(flow['nodes'])}
        story.append(para('단계별 설명과 근거', 'h2'))
        rows = [[para('단계', 'small'), para('수행 내용', 'small')]]
        for index, node in enumerate(flow['nodes']):
            rows.append([para(f'{index + 1:02d}', 'number'), paragraphs(node['label'], 'cell') + [evidence(node['evidence_ids'])]])
        story.append(table(rows, [45, WIDTH - 45], header=True))
        story.append(para('분기와 연결', 'h2'))
        for edge in flow['edges']:
            story.append(para(f'{lookup[edge["from"]]:02d} → {lookup[edge["to"]]:02d}   {edge["label"] or "다음 단계"}', 'small'))
    if not guide['workflows']:
        story.append(para('현재 근거에서 확인할 수 있는 업무 흐름이 없습니다.'))
    story.extend([CondPageBreak(100), para('04  최근 변경사항', 'h1')])
    for index, change in enumerate(guide['changes']):
        story.append(para(f'{index + 1:02d}  {change["summary"]}'))
        story.append(evidence(change['evidence_ids']))
    if not guide['changes']:
        story.append(para('이번 가이드에 포함된 변경사항이 없습니다.'))
    story.extend([CondPageBreak(100), para('05  확인할 질문', 'h1')])
    for index, question in enumerate(guide['questions']):
        story.extend([para(f'{index + 1:02d}  {question["question"]}', 'h2')])
        story.extend(paragraphs(question['reason']))
        story.append(evidence(question['evidence_ids']))
    if not guide['questions']:
        story.append(para('현재 문서에 등록된 추가 확인 질문은 없습니다.'))
    story.extend([PageBreak(), para('06  근거 자료', 'h1'), para('본문의 [번호]와 대응하는 자료입니다. 자료의 작성 일시와 승인 여부를 함께 확인하세요. 내부 식별자, 원문 전체, 인증 정보는 PDF에 포함하지 않습니다.', 'caption')])
    for index, source in enumerate(sources):
        story.append(para(f'[{index + 1}]  {source["title"]}', 'h2'))
        meta = ('확정 근거' if source.get('authority') == 'confirmed' else '참고 자료') + ' · ' + date(source.get('occurred_at'))
        if source.get('domain_name'):
            meta += ' · ' + source['domain_name']
        story.append(para(meta, 'small'))
    if not sources:
        story.append(para('연결된 근거 자료가 없습니다. 담당자가 원문 자료를 확인해야 합니다.'))
    doc.build(story, onFirstPage=page, onLaterPages=page)


def main():
    if len(sys.argv) != 3:
        raise ValueError('INPUT_INVALID')
    input_path, output_path = Path(sys.argv[1]), Path(sys.argv[2])
    if input_path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('INPUT_LIMIT')
    data = json.loads(input_path.read_text(encoding='utf-8'))
    fonts()
    global STYLES
    STYLES = styles()
    render(data, output_path)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = 'KOREAN_FONT_MISSING' if str(error) == 'KOREAN_FONT_MISSING' else 'RENDER_FAILED'
        print(json.dumps({'code': code}), file=sys.stderr)
        sys.exit(1)
