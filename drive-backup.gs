// TBM 안전조회 공용 저장소 (관리자 구글 계정의 Apps Script에 붙여넣기)
// 여러 폰이 팀 코드로 조회 기록·직원 명단·체크리스트를 주고받는다.
// 파일은 '내 드라이브 > TBM 안전조회 백업' 폴더에 쌓이고, 지운 기록은 그 안의 '삭제됨' 폴더로 옮겨 보관한다.
const TEAM_CODE = '여기에-팀-코드';   // ← 붙여넣은 뒤 원하는 코드로 바꾸세요 (예: 482915). 직원들이 처음 한 번 입력합니다.
const FOLDER_NAME = 'TBM 안전조회 백업';
const INDEX = 'tbm_index.json';      // 기록 목록 (id → 버전·날짜·현장·삭제 여부)
const SHARED = 'tbm_shared.json';    // 직원 명단·체크리스트
const MAX_BYTES = 30 * 1024 * 1024;

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = e.postData.contents;
    if (body.length > MAX_BYTES) return reply({ ok: false, error: 'too large' });
    const req = JSON.parse(body);
    if (req.app !== 'tbm-safety') return reply({ ok: false, error: 'bad data' });
    if (String(req.code) !== TEAM_CODE) return reply({ ok: false, error: 'bad code' });
    lock.waitLock(25000); // 여러 폰이 동시에 써도 목록이 꼬이지 않게 한 번에 하나씩
    const folder = getFolder();
    switch (req.action) {
      case 'ping': return reply({ ok: true });
      case 'list': return reply({ ok: true, index: loadIndex(folder) });
      case 'get': return reply({ ok: true, records: req.ids.slice(0, 10).map(id => readRecord(folder, id)).filter(Boolean) });
      case 'put': return reply(putRecord(folder, req.record));
      case 'delete': return reply(deleteRecord(folder, req.id));
      case 'getShared': return reply({ ok: true, shared: readJson(folder, SHARED) });
      case 'putShared': writeJson(folder, SHARED, req.shared); return reply({ ok: true });
    }
    return reply({ ok: false, error: 'bad action' });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

const okId = id => /^[a-z0-9]{6,30}$/.test(id);
const verOf = r => (r.closing && r.closing.at) || r.savedAt;

function putRecord(folder, r) {
  if (!r || !okId(r.id)) return { ok: false, error: 'bad id' };
  trashFiles(folder, r.id); // 같은 기록(종료 미팅 추가 등)이 다시 오면 옛 파일은 휴지통으로
  const name = ('TBM_' + r.date + '_' + r.site + '_' + r.id + '.txt').replace(/[\\/:*?"<>|]/g, '_');
  folder.createFile(name, JSON.stringify({ app: 'tbm-safety', version: 2, records: [r] }), MimeType.PLAIN_TEXT);
  const index = loadIndex(folder);
  index[r.id] = { ver: verOf(r), date: r.date, site: r.site };
  writeJson(folder, INDEX, index);
  return { ok: true };
}

function deleteRecord(folder, id) {
  if (!okId(id)) return { ok: false, error: 'bad id' };
  const bin = subFolder(folder, '삭제됨');
  const it = folder.searchFiles("title contains '" + id + "' and trashed = false");
  while (it.hasNext()) it.next().moveTo(bin);
  const index = loadIndex(folder);
  index[id] = Object.assign(index[id] || {}, { deleted: true, deletedAt: new Date().toISOString() });
  writeJson(folder, INDEX, index);
  return { ok: true };
}

function readRecord(folder, id) {
  if (!okId(id)) return null;
  const it = folder.searchFiles("title contains '" + id + "' and trashed = false");
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()).records[0] : null;
}

// 목록 파일이 없으면 (예전 버전이 올린 파일들로) 처음 한 번 만든다
function loadIndex(folder) {
  const index = readJson(folder, INDEX);
  if (index) return index;
  const built = {};
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!/^TBM_.*\.txt$/.test(f.getName())) continue;
    try {
      const r = JSON.parse(f.getBlob().getDataAsString()).records[0];
      if (r && okId(r.id)) built[r.id] = { ver: verOf(r), date: r.date, site: r.site };
    } catch (err) { /* 깨진 파일은 건너뜀 */ }
  }
  writeJson(folder, INDEX, built);
  return built;
}

function trashFiles(folder, id) {
  const it = folder.searchFiles("title contains '" + id + "' and trashed = false");
  while (it.hasNext()) it.next().setTrashed(true);
}

function readJson(folder, name) {
  const it = folder.getFilesByName(name);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : null;
}

function writeJson(folder, name, obj) {
  const it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(JSON.stringify(obj));
  else folder.createFile(name, JSON.stringify(obj), MimeType.PLAIN_TEXT);
}

function getFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function subFolder(folder, name) {
  const it = folder.getFoldersByName(name);
  return it.hasNext() ? it.next() : folder.createFolder(name);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
