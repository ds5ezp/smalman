// 설정 화면 동작 (CSP 때문에 인라인 스크립트 대신 별도 파일로 둠)
(async function () {
  const urlEl = document.getElementById('url');
  const autoEl = document.getElementById('autoStart');
  const errEl = document.getElementById('error');

  const cfg = await window.api.load();
  urlEl.value = cfg.url || '';
  autoEl.checked = !!cfg.autoStart;

  document.getElementById('cancel').addEventListener('click', () => window.close());

  document.getElementById('save').addEventListener('click', async () => {
    errEl.textContent = '';
    const res = await window.api.save({ url: urlEl.value, autoStart: autoEl.checked });
    if (!res.ok) errEl.textContent = res.message;
    // 성공하면 메인 프로그램이 설정 창을 닫음
  });
})();
