// TBM 안전조회 → 구글 드라이브 자동 백업 받는 곳 (관리자 구글 계정의 Apps Script에 붙여넣기)
// 이 스크립트는 '내 드라이브 > TBM 안전조회 백업' 폴더에 기록 파일을 넣기만 한다. 드라이브 내용을 밖으로 내보내지 않는다.
const FOLDER_NAME = 'TBM 안전조회 백업';
const MAX_BYTES = 30 * 1024 * 1024;

function doPost(e) {
  try {
    const body = e.postData.contents;
    if (body.length > MAX_BYTES) return reply({ ok: false, error: 'too large' });
    const data = JSON.parse(body);
    if (data.app !== 'tbm-safety' || !Array.isArray(data.records) || data.records.length !== 1) return reply({ ok: false, error: 'bad data' });
    const r = data.records[0];
    if (!/^[a-z0-9]{6,30}$/.test(r.id)) return reply({ ok: false, error: 'bad id' });

    const folder = getFolder();
    // 같은 기록(종료 미팅 추가 등)이 다시 오면 옛 파일은 휴지통으로
    const olds = folder.searchFiles("title contains '" + r.id + "' and trashed = false");
    while (olds.hasNext()) olds.next().setTrashed(true);
    const name = ('TBM_' + r.date + '_' + r.site + '_' + r.id + '.txt').replace(/[\/:*?"<>|]/g, '_');
    folder.createFile(name, body, MimeType.PLAIN_TEXT);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function getFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
