/**
 * ============================================================================
 * ENG Sightline & Stage Simulator Mark2
 * モジュール：【タブ12：AI自動生成】 tab12_ai_gen.js
 * 
 * 担当機能：
 *  - APIキー入力をUIから完全排除（裏側で安全に自動処理）
 *  - Google推奨モデル（gemini-3.8-flash等）を自動判定
 *  - High Demand（サーバー混雑）検知時の多段モデル自動フォールバック
 *  - 現場空間ルール（消防法通路、頭被り防止イントレ高、ステージ比率）組み込み
 *  - Markdownブロック除去・防弾JSONパース
 *  - 会場境界（room.w / room.d）への自動クランプ（座標補正）
 *  - 各モジュール（tab1〜tab11）への一括流し込み & Undo/再描画キック
 * ============================================================================
 */

(function () {
  'use strict';

  // APIキー（UIには表示せず、裏側で保持して通信に使用）
  const INTERNAL_API_KEY = 'AQ.Ab8RN6KJGpu-NbTRKYTpVfW8mSQIsy5L0SOpyuhNb9uSr9ukZg';

  // 内部状態
  let uploadedImageBase64 = null;
  let uploadedImageMime = null;

  // ==========================================================================
  // 1. UI動的生成 (#panel-ai_gen または #panel-ai)
  // ==========================================================================
  function initUI() {
    const container = document.getElementById('panel-ai_gen') || document.getElementById('panel-ai');
    if (!container) return;

    container.innerHTML = `
      <div class="ui-group">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>🖼️ 白図・平面図画像 (任意マルチモーダル)</span>
          <button type="button" class="btn-action" id="aiBtnClearImg" style="padding:1px 6px; font-size:10px;">✕ 画像クリア</button>
        </div>
        <div class="input-box">
          <label>会場白図 / 建築図面 (PNG/JPG)</label>
          <input type="file" id="aiFloorPlanFile" accept="image/*" style="height:auto; padding:3px; font-size:10px;">
        </div>
        <div id="aiImagePreviewContainer" style="display:none; margin-top:6px; border:1px dashed #cbd5e1; border-radius:4px; padding:4px; text-align:center; background:#f8fafc;">
          <img id="aiImagePreview" src="" alt="プレビュー" style="max-height:100px; max-width:100%; object-fit:contain; border-radius:2px;">
          <div id="aiImageMeta" style="font-size:9px; color:#64748b; margin-top:2px;"></div>
        </div>
      </div>

      <div class="ui-group">
        <div class="ui-group-title">💬 レイアウト要望・設計プロンプト</div>
        <div class="input-box">
          <textarea id="aiPromptInput" style="width:100%; height:110px; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px; resize:vertical; line-height:1.4;" placeholder="例: 間口18m、奥行28mの展示場。ステージ幅10m、登壇者3名と司会台。客席160席を3ブロック（通路1200mm）。客席後ろに前頭被りしないENGメインカメラ2台と返しモニター2台を配置。"></textarea>
        </div>
        <div class="ui-row full" style="margin-top:6px;">
          <button class="btn-action" id="btnRunAiGen" style="width:100%; padding:9px; background:#2563eb; color:#ffffff; font-weight:bold; border-color:#2563eb; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.1); cursor:pointer;">
            ⚡ AIでレイアウト自動生成
          </button>
        </div>
        <!-- 進捗・診断・エラー表示領域 -->
        <div id="aiStatusBox" style="margin-top:8px; padding:6px 8px; font-size:11px; border-radius:4px; min-height:22px; display:none; line-height:1.4; word-break:break-all;"></div>
      </div>
    `;

    bindUIEvents();
  }

  // ==========================================================================
  // 2. UIイベント設定
  // ==========================================================================
  function bindUIEvents() {
    const fileInput = document.getElementById('aiFloorPlanFile');
    const clearImgBtn = document.getElementById('aiBtnClearImg');
    const runBtn = document.getElementById('btnRunAiGen');

    if (fileInput) {
      fileInput.addEventListener('change', handleImageUpload);
    }

    if (clearImgBtn) {
      clearImgBtn.addEventListener('click', () => {
        uploadedImageBase64 = null;
        uploadedImageMime = null;
        if (fileInput) fileInput.value = '';
        const prevContainer = document.getElementById('aiImagePreviewContainer');
        if (prevContainer) prevContainer.style.display = 'none';
        setStatus('添付画像をクリアしました', '#64748b');
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', runAiGeneration);
    }
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    uploadedImageMime = file.type || 'image/png';
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target.result;
      uploadedImageBase64 = dataUrl.split(',')[1];

      const prevContainer = document.getElementById('aiImagePreviewContainer');
      const prevImg = document.getElementById('aiImagePreview');
      const prevMeta = document.getElementById('aiImageMeta');
      if (prevContainer && prevImg) {
        prevImg.src = dataUrl;
        prevContainer.style.display = 'block';
        if (prevMeta) {
          prevMeta.innerText = `${file.name} (${Math.round(file.size / 1024)} KB)`;
        }
      }
      setStatus('白図画像を読み込みました。要望と合わせてAIへ送信されます。', '#0284c7');
    };
    reader.readAsDataURL(file);
  }

  function setStatus(msg, color = '#64748b', isError = false) {
    const box = document.getElementById('aiStatusBox');
    if (!box) return;
    box.style.display = 'block';
    box.style.color = color;
    box.style.backgroundColor = isError ? '#fef2f2' : '#f0f9ff';
    box.style.border = `1px solid ${isError ? '#fca5a5' : '#bae6fd'}`;
    box.innerHTML = msg;
  }

  // ==========================================================================
  // 3. 現場ルール組み込みシステムプロンプト
  // ==========================================================================
  function buildSystemPrompt() {
    return `あなたはイベント設営・舞台美術・ENGカメラ中継の熟練チーフプランナーです。
ユーザーの指示、または添付された白図画像を解析し、正確で整合性の取れた空間レイアウトJSONを生成してください。

【厳格な物理・空間ルール】
1. 単位はすべてミリメートル(mm)、角度は度(deg)です。座標原点(0,0)は部屋の左上(奥・下手端)です。
2. 会場(room):
   - w(間口幅): 8000〜40000mm、d(奥行): 10000〜60000mm、h(天井高): 3500〜8000mm。
3. ステージ(stage):
   - 幅(w)は会場幅の50%〜70%を確保すること。
   - 奥行(d)は2000〜5000mm、高さ(h)は400〜1000mm。
   - x座標は会場中央に対称配置（x = (room.w - stage.w) / 2）。奥壁からy=800〜1500mm離隔。
4. 司会台(podium):
   - 幅900mm、奥行600mm、高さ1100mm。ステージ上の上手または下手の見切れのない位置に配置。
5. 客席(seats / seatLayout):
   - 席幅480〜500mm、前後ピッチ900〜1000mm。
   - 消防法に準拠し、中央主通路幅(aisleW)は1200mm以上を確保すること。
   - ステージ前縁から最前列までは2000〜3000mm離隔(stageDist)。
6. カメラ(cameras):
   - 客席最後列から1000〜2000mm後方に配置。
   - 客席の観客頭頂高（Z=1270mm）による前頭被りを防止するため、カメラ台座(イントレ platH)の高さを適切に算出（200〜800mm）して配置すること。
   - lensH(レンズ高)は通常 1550〜1750mm。機種は "nx5r", "eng_std", "eng_ext" のいずれか。
7. 返しモニター(monitors):
   - ステージ前端の中央または左右に、登壇者に向けて床置き(placeOn: "floor", tilt: 25)で配置。

【出力要件】
余計な解説、挨拶、前置き、Markdownコードブロック（\`\`\`json等）は一切含めず、純粋なJSONオブジェクトのみを出力してください。

{
  "room": { "w": 16000, "d": 24000, "h": 5000 },
  "stage": { "x": 3000, "y": 1000, "w": 10000, "d": 2500, "h": 600 },
  "podium": { "enabled": true, "w": 900, "d": 600, "h": 1100, "angle": 15, "x": 3500, "y": 2000, "hasHost": true },
  "panels": [
    { "name": "バックパネル 1", "w": 6000, "d": 100, "h": 2400, "x": 5000, "y": 1000, "enabled": true }
  ],
  "seatConfig": {
    "rows": 12,
    "rowPitch": 950,
    "blockCols": "4,6,4",
    "aisleW": 1200,
    "stageDist": 2500
  },
  "guests": [
    { "name": "登壇者 1", "type": "high_chair", "h": 750, "x": 8000, "y": 2200 }
  ],
  "cameras": [
    { "name": "CAM 1 (正面メイン)", "model": "nx5r", "lensH": 1700, "fov": 38, "shotType": "stage_ff", "platW": 1000, "platD": 1000, "platH": 400, "x": 8000, "y": 18000, "pan": 0, "tilt": 0 }
  ],
  "monitors": [
    { "name": "返しモニター 1 (50\\")", "size": "50", "x": 8000, "y": 3600, "placeOn": "floor", "panAngle": 0, "tilt": 25, "w": 1110, "h": 625, "baseW": 680, "baseD": 550, "fov": 90 }
  ]
}`;
  }

  // ==========================================================================
  // 4. API呼び出し実行（混雑自動回避・多段フォールバック推論）
  // ==========================================================================
  async function runAiGeneration() {
    const promptArea = document.getElementById('aiPromptInput');
    const runBtn = document.getElementById('btnRunAiGen');

    const apiKey = INTERNAL_API_KEY;
    const userPrompt = promptArea ? promptArea.value.trim() : '';

    if (!userPrompt && !uploadedImageBase64) {
      setStatus('❌ 要望プロンプトを入力するか、白図画像をアップロードしてください。', '#dc2626', true);
      return;
    }

    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerText = '⏳ AI推論エンジン準備中...';
    }

    try {
      setStatus('🔑 利用可能なAIモデルのリストを確認中...', '#0284c7');

      // 1. 利用可能モデル一覧を取得
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const listRes = await fetch(listUrl);

      let usableModels = [];
      if (listRes.ok) {
        const listData = await listRes.json();
        const allModels = listData.models || [];
        usableModels = allModels.filter(m =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          !m.name.includes('2.5') // 受付終了モデルは除外
        );
      }

      // 優先候補モデルのリストを作成（混雑時に上から順番にフォールバック）
      const priorityOrder = [
        'gemini-3.8-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
        'gemini-1.5-pro-latest'
      ];

      const candidateModels = [];
      priorityOrder.forEach(pName => {
        const found = usableModels.find(m => m.name.includes(pName));
        if (found && !candidateModels.includes(found.name)) {
          candidateModels.push(found.name);
        }
      });

      // APIリストに載っているその他の候補も追加
      usableModels.forEach(m => {
        if (!candidateModels.includes(m.name)) {
          candidateModels.push(m.name);
        }
      });

      // 万一リストが空の場合の安全策
      if (candidateModels.length === 0) {
        candidateModels.push('models/gemini-3.8-flash', 'models/gemini-1.5-flash', 'models/gemini-1.5-pro');
      }

      // 2. ペイロード構築
      const parts = [];
      parts.push({ text: buildSystemPrompt() });

      if (uploadedImageBase64) {
        parts.push({
          inline_data: {
            mime_type: uploadedImageMime || 'image/png',
            data: uploadedImageBase64
          }
        });
        parts.push({ text: '添付された会場平面図の障害物・柱・形状を正確に読み取り、それに適応したレイアウトを設計してください。' });
      }

      if (userPrompt) {
        parts.push({ text: `【ユーザーの個別要望・会場条件】\n${userPrompt}` });
      }

      // 3. 候補モデルを順に試行（High Demand または エラー時は即座に次を試す）
      let rawText = null;
      let successfulModel = '';
      let lastErrorMessage = '';

      for (let i = 0; i < candidateModels.length; i++) {
        const currentModelPath = candidateModels[i];
        const currentShortName = currentModelPath.replace('models/', '');

        setStatus(`⚡ AI空間設計を実行中... (試行 ${i + 1}/${candidateModels.length}: ${currentShortName})`, '#0284c7');
        if (runBtn) runBtn.innerText = `⏳ 設計中 (${currentShortName})...`;

        try {
          const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${currentModelPath}:generateContent?key=${apiKey}`;

          const response = await fetch(generateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: parts }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2
              }
            })
          });

          if (!response.ok) {
            let errDetail = `HTTP ${response.status} ${response.statusText}`;
            try {
              const errJson = await response.json();
              if (errJson.error?.message) errDetail = errJson.error.message;
            } catch (_) {}

            // 混雑(high demand)や受付終了の場合は次のモデルへ即時フォールバック
            console.warn(`[AI Gen] ${currentShortName} 失敗: ${errDetail}`);
            lastErrorMessage = `${currentShortName}: ${errDetail}`;
            continue;
          }

          const data = await response.json();
          rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (rawText) {
            successfulModel = currentShortName;
            break; // 成功！ループ脱出
          }
        } catch (fetchErr) {
          console.warn(`[AI Gen] 通信エラー (${currentShortName}):`, fetchErr);
          lastErrorMessage = `${currentShortName}: ${fetchErr.message}`;
        }
      }

      if (!rawText) {
        throw new Error(`全候補モデルでの試行が混雑・エラーとなりました。\n最新エラー: ${lastErrorMessage}`);
      }

      // 4. 防弾JSONパース
      const parsedData = cleanAndParseJson(rawText);

      // 5. 安全境界クランプ
      const clampedData = clampLayoutToBounds(parsedData);

      // 6. 各モジュールへデータ注入
      applyLayoutToSimulator(clampedData);

      setStatus(`✅ AIレイアウトの生成・全モジュール同期に成功しました！ (使用モデル: ${successfulModel})`, '#16a34a');

    } catch (err) {
      console.error('[tab12_ai_gen Error]', err);
      setStatus(`❌ 生成失敗: ${err.message}`, '#dc2626', true);
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerText = '⚡ AIでレイアウト自動生成';
      }
    }
  }

  // ==========================================================================
  // 5. 防弾JSONパーサー
  // ==========================================================================
  function cleanAndParseJson(str) {
    if (typeof str !== 'string') throw new Error('パース対象が文字列ではありません');

    let cleaned = str.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    cleaned = cleaned.trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`JSON構文エラー: AI応答のパースに失敗しました (${e.message})\n生データ:\n${str.substring(0, 150)}...`);
    }
  }

  // ==========================================================================
  // 6. 安全境界クランプ処理
  // ==========================================================================
  function clampLayoutToBounds(layout) {
    if (!layout || typeof layout !== 'object') return layout;

    const rW = Math.max(5000, Number(layout.room?.w) || window.room?.w || 16000);
    const rD = Math.max(5000, Number(layout.room?.d) || window.room?.d || 24000);
    const rH = Math.max(2500, Number(layout.room?.h) || window.room?.h || 5000);

    layout.room = {
      w: rW,
      d: rD,
      h: rH,
      shapeType: 'rect',
      points: [
        { x: 0, y: 0 },
        { x: rW, y: 0 },
        { x: rW, y: rD },
        { x: 0, y: rD }
      ]
    };

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    // ステージ
    if (layout.stage) {
      const sw = clamp(Number(layout.stage.w) || 8000, 2000, rW);
      const sd = clamp(Number(layout.stage.d) || 2400, 1500, rD * 0.4);
      const sh = clamp(Number(layout.stage.h) || 600, 200, 1500);
      const sx = clamp(Number(layout.stage.x) || (rW - sw) / 2, 0, rW - sw);
      const sy = clamp(Number(layout.stage.y) || 1000, 0, rD - sd);
      layout.stage = { w: sw, d: sd, h: sh, x: sx, y: sy };
    }

    // 司会台
    if (layout.podium) {
      const pw = Number(layout.podium.w) || 900;
      const pd = Number(layout.podium.d) || 600;
      layout.podium.x = clamp(Number(layout.podium.x) || 1000, 0, rW - pw);
      layout.podium.y = clamp(Number(layout.podium.y) || 1500, 0, rD - pd);
    }

    // 登壇者
    if (Array.isArray(layout.guests)) {
      layout.guests.forEach((g, idx) => {
        g.id = g.id || `G${idx + 1}`;
        g.x = clamp(Number(g.x) || rW / 2, 200, rW - 200);
        g.y = clamp(Number(g.y) || 2000, 200, rD - 200);
        g.h = clamp(Number(g.h) || 750, 400, 1800);
      });
    }

    // カメラ
    if (Array.isArray(layout.cameras)) {
      layout.cameras.forEach((c, idx) => {
        c.id = c.id || `CAM${idx + 1}`;
        const pw = Number(c.platW) || 1000;
        const pd = Number(c.platD) || 1000;
        c.x = clamp(Number(c.x) || rW / 2, pw / 2, rW - pw / 2);
        c.y = clamp(Number(c.y) || rD * 0.8, pd / 2, rD - pd / 2);
        c.platH = clamp(Number(c.platH) || 400, 0, 2000);
        c.lensH = clamp(Number(c.lensH) || 1700, 1200, 2500);
      });
    }

    // モニター
    if (Array.isArray(layout.monitors)) {
      layout.monitors.forEach((m, idx) => {
        m.id = m.id || `M${idx + 1}`;
        m.x = clamp(Number(m.x) || rW / 2, 500, rW - 500);
        m.y = clamp(Number(m.y) || 3500, 500, rD - 500);
      });
    }

    return layout;
  }

  // ==========================================================================
  // 7. 各タブモジュールへの一括流し込み & 反映
  // ==========================================================================
  function applyLayoutToSimulator(data) {
    if (!data) return;

    // 1. 会場 (tab1)
    if (data.room) {
      if (window.tabRoomModule && typeof window.tabRoomModule.importData === 'function') {
        window.tabRoomModule.importData({ room: data.room });
      } else {
        window.room = Object.assign(window.room || {}, data.room);
      }
    }

    // 2. ステージ & バックパネル (tab2)
    if (window.tabFacilityModule && typeof window.tabFacilityModule.importData === 'function') {
      window.tabFacilityModule.importData({
        stage: data.stage,
        panels: data.panels
      });
    } else {
      if (data.stage) window.stage = Object.assign(window.stage || {}, data.stage);
      if (data.panels) window.panels = data.panels;
    }

    // 3. 司会台 (tab3)
    if (data.podium) {
      if (window.tabPodiumModule && typeof window.tabPodiumModule.importData === 'function') {
        window.tabPodiumModule.importData(data.podium);
      } else {
        window.podium = Object.assign(window.podium || {}, data.podium);
      }
    }

    // 4. 登壇者 (tab4)
    if (Array.isArray(data.guests)) {
      if (window.tabGuestsModule && typeof window.tabGuestsModule.importData === 'function') {
        window.tabGuestsModule.importData(data.guests);
      } else {
        window.guests = data.guests;
        window.selectedGuestId = data.guests[0]?.id || 'G1';
      }
    }

    // 5. 客席グリッド (tab6)
    if (data.seatConfig) {
      const cfg = data.seatConfig;
      const rowsEl = document.getElementById('rows');
      const pitchEl = document.getElementById('rowPitch');
      const blockEl = document.getElementById('blockCols');
      const distEl = document.getElementById('stageDist') || document.getElementById('stageDistance');
      const aisleEl = document.getElementById('aisleW');

      if (rowsEl && cfg.rows) rowsEl.value = cfg.rows;
      if (pitchEl && cfg.rowPitch) pitchEl.value = cfg.rowPitch;
      if (blockEl && cfg.blockCols) blockEl.value = cfg.blockCols;
      if (distEl && cfg.stageDist) distEl.value = cfg.stageDist;
      if (aisleEl && cfg.aisleW) aisleEl.value = cfg.aisleW;

      if (window.tabSeatsModule && typeof window.tabSeatsModule.rebuildGrid === 'function') {
        window.tabSeatsModule.rebuildGrid();
      } else if (typeof window.rebuildSeats === 'function') {
        window.rebuildSeats();
      }
    }

    // 6. カメラ (tab7 / CameraBase)
    if (Array.isArray(data.cameras)) {
      if (window.CameraBase && typeof window.CameraBase.importData === 'function') {
        window.CameraBase.importData(data.cameras);
      } else if (window.tabCameraModule && typeof window.tabCameraModule.importData === 'function') {
        window.tabCameraModule.importData(data.cameras);
      } else {
        window.cameras = data.cameras;
        window.selectedCamId = data.cameras[0]?.id || 'CAM1';
      }
    }

    // 7. モニター (tab10)
    if (Array.isArray(data.monitors)) {
      if (window.tabMonitorModule && typeof window.tabMonitorModule.importData === 'function') {
        window.tabMonitorModule.importData(data.monitors);
      } else {
        window.monitors = data.monitors;
        window.videoDevices = data.monitors;
      }
    }

    // UI同期 & 履歴保存 & 再描画
    if (typeof window.syncCoreInputs === 'function') window.syncCoreInputs();
    if (typeof window.saveHistory === 'function') window.saveHistory();
    if (typeof window.requestRender === 'function') {
      window.requestRender();
    } else if (typeof window.render === 'function') {
      window.render();
    }
  }

  // ==========================================================================
  // 8. モジュール公開インターフェース
  // ==========================================================================
  function exportData() {
    const promptArea = document.getElementById('aiPromptInput');
    return {
      lastPrompt: promptArea ? promptArea.value : ''
    };
  }

  function importData(state) {
    if (!state) return;
    const promptArea = document.getElementById('aiPromptInput');
    if (promptArea && state.lastPrompt) {
      promptArea.value = state.lastPrompt;
    }
  }

  window.tabAiGenModule = {
    initUI: initUI,
    runAiGeneration: runAiGeneration,
    exportData: exportData,
    importData: importData,
    cleanAndParseJson: cleanAndParseJson,
    clampLayoutToBounds: clampLayoutToBounds
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

})();