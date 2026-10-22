/**
 * ==============================================================================
 * EQWEL 会場図面 & ENG視界シミュレーター Mark2
 * 【デバッグ・意見BOXモジュール】 (debug_box.js)
 * 
 * 担当機能:
 * 1. 画面左下デバッグBOXの折りたたみ（最小化 / 展開）
 * 2. タブ切り替え（「📋 ログ・診断」/「✉️ ご意見送信」）
 * 3. コアエンジン・各タブからのログ出力（log, info, warn, error）と自動スクロール
 * 4. ログ消去（clear）
 * 5. 図面状態スナップショット付きの意見・フィードバック送信（GAS連携 / mailtoフォールバック）
 * ==============================================================================
 */

(function () {
  'use strict';

  // --- 設定項目 ---
  // ※後ほどGoogle Apps Script (GAS) をデプロイした際、発行されたウェブアプリURLをここに設定します
  const CONFIG = {
    gasWebAppUrl: '', // 例: 'https://script.google.com/macros/s/XXXXX/exec'
    maxLogCount: 60,  // BOX内に保持する最大ログ行数
    adminEmail: 'stage-support@example.com' // GAS未設定時のmailtoフォールバック宛先
  };

  // ============================================================================
  // 1. UI制御（折りたたみ・タブ切り替え）
  // ============================================================================

  let isCollapsed = false;

  /**
   * BOX全体の折りたたみ / 展開
   */
  window.toggleDebugBox = function () {
    const body = document.getElementById('debug-box-body');
    const toggleBtn = document.getElementById('btn-debug-toggle');
    if (!body) return;

    isCollapsed = !isCollapsed;
    body.style.display = isCollapsed ? 'none' : 'flex';
    if (toggleBtn) {
      toggleBtn.innerText = isCollapsed ? '＋' : '－';
    }
  };

  /**
   * タブ切り替え ('log' または 'mail')
   */
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

    // 折りたたまれている場合は開く
    if (isCollapsed) {
      window.toggleDebugBox();
    }
  };

  // ============================================================================
  // 2. ログ・診断出力API (window.debugBox)
  // ============================================================================

  function appendLogItem(message, level = 'info') {
    const container = document.getElementById('debug-box-content');
    if (!container) return;

    // 現在時刻 [HH:MM:SS]
    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join(':');

    const item = document.createElement('div');
    item.className = `debug-item ${level}`;
    item.innerText = `[${timeStr}] ${message}`;

    container.appendChild(item);

    // 最大行数を超えたら古いものを削除
    while (container.children.length > CONFIG.maxLogCount) {
      container.removeChild(container.firstChild);
    }

    // 最下部へ自動スクロール
    container.scrollTop = container.scrollHeight;
  }

  const debugBoxAPI = {
    /**
     * 通常情報ログ
     */
    log: function (msg) {
      appendLogItem(msg, 'info');
    },
    info: function (msg) {
      appendLogItem(msg, 'info');
    },

    /**
     * 警告ログ（視野被り・干渉など）
     */
    warn: function (msg) {
      appendLogItem(msg, 'warn');
    },

    /**
     * エラーログ
     */
    error: function (msg) {
      appendLogItem(msg, 'error');
    },

    /**
     * ログ表示エリアの消去
     */
    clear: function () {
      const container = document.getElementById('debug-box-content');
      if (container) {
        container.innerHTML = '<div class="debug-item info">ログを消去しました。待機中...</div>';
      }
    },

    /**
     * 診断結果のフォーマット流し込み
     */
    diagnose: function (diagData) {
      if (!diagData) return;
      if (typeof diagData === 'string') {
        this.info(`[診断] ${diagData}`);
        return;
      }

      this.info(`--- 【システム自動診断】 ---`);
      if (diagData.roomInfo) this.info(`会場: ${diagData.roomInfo}`);
      if (diagData.stats) this.info(`統計: ${diagData.stats}`);
      if (diagData.cameraDetails) this.info(`カメラ: ${diagData.cameraDetails}`);
      if (diagData.warnings && Array.isArray(diagData.warnings)) {
        diagData.warnings.forEach(w => this.warn(`⚠️ ${w}`));
      }
    },

    /**
     * GAS エンドポイントURLの設定
     */
    setGasUrl: function (url) {
      CONFIG.gasWebAppUrl = url;
    },

    // ============================================================================
    // 3. ご意見・フィードバック送信処理
    // ============================================================================
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
        if (statusEl) {
          statusEl.style.color = '#f87171';
          statusEl.innerText = '※ご意見・不具合内容を入力してください。';
        }
        return;
      }

      // システムスナップショットの取得
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
      if (statusEl) {
        statusEl.style.color = '#38bdf8';
        statusEl.innerText = '送信中...';
      }

      // GAS WebApp URL が設定されている場合 (POST通信)
      if (CONFIG.gasWebAppUrl) {
        try {
          const response = await fetch(CONFIG.gasWebAppUrl, {
            method: 'POST',
            mode: 'no-cors', // GASクロスオリジン対応
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (statusEl) {
            statusEl.style.color = '#4ade80';
            statusEl.innerText = '✅ 送信完了しました。ありがとうございます！';
          }
          if (contentInput) contentInput.value = '';
          appendLogItem(`フィードバック送信完了 (${payload.sender})`, 'info');
        } catch (err) {
          console.error('GAS送信エラー:', err);
          if (statusEl) {
            statusEl.style.color = '#f87171';
            statusEl.innerText = '送信に失敗しました。時間をおいて再試行してください。';
          }
          appendLogItem(`フィードバック送信失敗: ${err.message}`, 'error');
        } finally {
          if (sendBtn) sendBtn.disabled = false;
        }
      } else {
        // GAS URL未設定時のフォールバック (クリップボードコピー ＆ メーラー起動)
        const summaryText = systemSnapshot ? `\n\n【図面状態】\n${systemSnapshot.roomInfo || ''}\n${systemSnapshot.stats || ''}\n${systemSnapshot.cameraDetails || ''}` : '';
        const mailBody = `【送信者】: ${payload.sender}\n【送信日時】: ${payload.timestamp}\n\n【内容】:\n${payload.content}${summaryText}`;

        try {
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(mailBody);
          }
        } catch (_) {}

        if (statusEl) {
          statusEl.style.color = '#fde68a';
          statusEl.innerText = '⚠️ GAS未設定: 内容をコピーしました。メーラーを起動します。';
        }

        const mailtoUri = `mailto:${CONFIG.adminEmail}?subject=${encodeURIComponent('【図面シミュレーターMark2】意見・報告')}&body=${encodeURIComponent(mailBody)}`;
        window.open(mailtoUri, '_blank');

        if (sendBtn) sendBtn.disabled = false;
        appendLogItem(`メール起動 (GAS未連携)`, 'warn');
      }
    }
  };

  // グローバル公開
  window.debugBox = debugBoxAPI;
  window.debugBoxModule = debugBoxAPI;

  // 初期化完了通知
  window.addEventListener('DOMContentLoaded', () => {
    // 起動時の初期ログ
    appendLogItem('デバッグBOXモジュールが準備完了しました', 'info');
  });
})();