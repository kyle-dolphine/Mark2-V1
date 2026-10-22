/**
 * ==============================================================================
 * EQWEL 会場図面 & ENG視界シミュレーター Mark2
 * 【デバッグ・意見BOXモジュール】 (debug_box.js)
 * 
 * 変更点:
 * - 画面内を自由にドラッグ移動できる機能 (setupDebugBoxDragging) を追加
 * - ログの視認性向上
 * ==============================================================================
 */

(function () {
  'use strict';

  const CONFIG = {
    gasWebAppUrl: '', 
    maxLogCount: 60,
    adminEmail: 'stage-support@example.com' 
  };

  let isCollapsed = false;

  // ============================================================================
  // 1. UI制御（折りたたみ・タブ・★ドラッグ移動）
  // ============================================================================

  window.toggleDebugBox = function () {
    const body = document.getElementById('debug-box-body');
    const toggleBtn = document.getElementById('btn-debug-toggle');
    if (!body) return;

    isCollapsed = !isCollapsed;
    body.style.display = isCollapsed ? 'none' : 'flex';
    if (toggleBtn) toggleBtn.innerText = isCollapsed ? '＋' : '－';
  };

  window.switchDebugTab = function (tabKey) {
    const btnLog = document.getElementById('tabbtn-dbg-log');
    const btnMail = document.getElementById('tabbtn-dbg-mail');
    const panelLog = document.getElementById('panel-dbg-log');
    const panelMail = document.getElementById('panel-dbg-mail');

    if (tabKey === 'log') {
      if (btnLog) btnLog.classList.add('active');
      if (btnMail) btnMail.classList.remove('active');
      if (panelLog) panelLog.classList.add('active');
      if (panelMail) panelMail.classList.remove('active');
    } else {
      if (btnMail) btnMail.classList.add('active');
      if (btnLog) btnLog.classList.remove('active');
      if (panelMail) panelMail.classList.add('active');
      if (panelLog) panelLog.classList.remove('active');
    }
    if (isCollapsed) window.toggleDebugBox();
  };

  // ★ 追加：デバッグBOXのドラッグ移動機構
  function setupDebugBoxDragging() {
    const box = document.getElementById('debug-box');
    const header = box ? box.querySelector('.debug-box-header') : null;
    if (!box || !header) return;

    // スクロールの巻き添えを防ぐため body 直下へ移動
    if (box.parentElement !== document.body) {
      document.body.appendChild(box);
    }

    // 初期スタイル（左下固定からスタート）
    box.style.position = 'fixed';
    box.style.zIndex = '999998'; // パレットより1つ下
    box.style.margin = '0';
    box.style.left = '12px';
    box.style.bottom = '12px';
    box.style.top = 'auto';
    box.style.right = 'auto';

    let isDraggingBox = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', e => {
      // ボタン類をクリックした時はドラッグしない
      if (['BUTTON', 'INPUT'].includes(e.target.tagName)) return;
      if (e.target.closest('.debug-box-actions')) return;

      isDraggingBox = true;
      const rect = box.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      // 座標モードを bottom/right から top/left 制御へ切り替え
      box.style.bottom = 'auto';
      box.style.right = 'auto';
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      box.style.transition = 'none'; // ドラッグ中のラグ防止

      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
      if (!isDraggingBox) return;
      let newLeft = e.clientX - offsetX;
      let newTop = e.clientY - offsetY;

      // 画面外への飛び出しブロック
      const pad = 10;
      const maxLeft = window.innerWidth - box.offsetWidth - pad;
      const maxTop = window.innerHeight - 40;
      
      newLeft = Math.max(pad, Math.min(newLeft, maxLeft));
      newTop = Math.max(pad, Math.min(newTop, maxTop));

      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDraggingBox) {
        isDraggingBox = false;
        document.body.style.userSelect = 'auto';
        box.style.transition = 'max-height 0.2s ease';
      }
    });
  }

  // ============================================================================
  // 2. ログ・診断出力API (window.debugBox)
  // ============================================================================
  function appendLogItem(message, level = 'info') {
    const container = document.getElementById('debug-box-content');
    if (!container) return;

    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join(':');

    // 絵文字が含まれていないシステムログには青ポッチを付ける
    const hasEmoji = /[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/.test(message);
    const prefix = hasEmoji ? '' : '🔹 ';

    const item = document.createElement('div');
    item.className = `debug-item ${level}`;
    item.innerText = `[${timeStr}] ${prefix}${message}`;

    container.appendChild(item);

    while (container.children.length > CONFIG.maxLogCount) {
      container.removeChild(container.firstChild);
    }
    container.scrollTop = container.scrollHeight;
  }

  const debugBoxAPI = {
    log: function (msg) { appendLogItem(msg, 'info'); },
    info: function (msg) { appendLogItem(msg, 'info'); },
    warn: function (msg) { appendLogItem(msg, 'warn'); },
    error: function (msg) { appendLogItem(msg, 'error'); },
    clear: function () {
      const container = document.getElementById('debug-box-content');
      if (container) container.innerHTML = '<div class="debug-item info">🧹 ログを消去しました</div>';
    },
    diagnose: function (diagData) {
      if (!diagData) return;
      if (typeof diagData === 'string') return this.info(`[診断] ${diagData}`);
      this.info(`--- 【システム自動診断】 ---`);
      if (diagData.roomInfo) this.info(`会場: ${diagData.roomInfo}`);
      if (diagData.stats) this.info(`統計: ${diagData.stats}`);
      if (diagData.cameraDetails) this.info(`カメラ: ${diagData.cameraDetails}`);
      if (diagData.warnings && Array.isArray(diagData.warnings)) diagData.warnings.forEach(w => this.warn(`⚠️ ${w}`));
    },
    setGasUrl: function (url) { CONFIG.gasWebAppUrl = url; },
    sendFeedback: async function () {
      const senderInput = document.getElementById('feedback-sender');
      const contentInput = document.getElementById('feedback-content');
      const attachCheck = document.getElementById('feedback-attach-state');
      const statusEl = document.getElementById('feedback-status');
      const sendBtn = document.getElementById('btn-dbg-send');

      const sender = senderInput ? senderInput.value.trim() : '';
      const content = contentInput ? contentInput.value.trim() : '';
      const isAttach = attachCheck ? attachCheck.checked : true;

      if (!content) {
        if (statusEl) { statusEl.style.color = '#f87171'; statusEl.innerText = '※ご意見・不具合内容を入力してください。'; }
        return;
      }

      let systemSnapshot = null;
      if (isAttach && window.core && typeof window.core.getSystemSummary === 'function') {
        systemSnapshot = window.core.getSystemSummary();
      }

      const payload = {
        sender: sender || '匿名担当者',
        content: content,
        timestamp: new Date().toLocaleString('ja-JP'),
        userAgent: navigator.userAgent,
        snapshot: systemSnapshot
      };

      if (sendBtn) sendBtn.disabled = true;
      if (statusEl) { statusEl.style.color = '#38bdf8'; statusEl.innerText = '送信中...'; }

      if (CONFIG.gasWebAppUrl) {
        try {
          await fetch(CONFIG.gasWebAppUrl, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (statusEl) { statusEl.style.color = '#4ade80'; statusEl.innerText = '✅ 送信完了しました。'; }
          if (contentInput) contentInput.value = '';
          appendLogItem(`フィードバック送信完了`, 'info');
        } catch (err) {
          if (statusEl) { statusEl.style.color = '#f87171'; statusEl.innerText = '送信失敗。'; }
          appendLogItem(`送信失敗: ${err.message}`, 'error');
        } finally {
          if (sendBtn) sendBtn.disabled = false;
        }
      } else {
        const summaryText = systemSnapshot ? `\n\n【図面状態】\n${systemSnapshot.roomInfo || ''}\n${systemSnapshot.stats || ''}\n${systemSnapshot.cameraDetails || ''}` : '';
        const mailBody = `【送信者】: ${payload.sender}\n【送信日時】: ${payload.timestamp}\n\n【内容】:\n${payload.content}${summaryText}`;
        try { if (navigator.clipboard) await navigator.clipboard.writeText(mailBody); } catch (_) {}
        if (statusEl) { statusEl.style.color = '#fde68a'; statusEl.innerText = '⚠️ 内容をコピーし、メーラーを起動します。'; }
        window.open(`mailto:${CONFIG.adminEmail}?subject=${encodeURIComponent('【図面シミュレーターMark2】意見・報告')}&body=${encodeURIComponent(mailBody)}`, '_blank');
        if (sendBtn) sendBtn.disabled = false;
        appendLogItem(`メール起動 (GAS未連携)`, 'warn');
      }
    }
  };

  window.debugBox = debugBoxAPI;
  window.debugBoxModule = debugBoxAPI;

  window.addEventListener('DOMContentLoaded', () => {
    setupDebugBoxDragging();
    appendLogItem('システム起動・ログ監視を開始しました', 'info');
  });
})();