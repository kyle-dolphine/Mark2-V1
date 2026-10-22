/**
 * tab7_camera.js - カメラ操作UI・描画モジュール (Mark2 無敵フォールバック＆完全自律描画版)
 * 依存: camera_angle.js, camera_base.js (無くても自律動作可能)
 */
window.tabCameraModule = (function () {
  'use strict';

  // --- 内部バックアップ用データ ---
  let internalCameras = [];
  let internalSelectedId = null;

  // --- 再描画 & 履歴保存の安全呼び出し ---
  function triggerRender() {
    if (typeof window.requestRender === 'function') window.requestRender();
    else if (typeof window.render === 'function') window.render();
    else if (typeof render === 'function') render();
  }

  function triggerHistory() {
    if (typeof window.saveHistory === 'function') window.saveHistory();
    else if (typeof saveHistory === 'function') saveHistory();
  }

  function getSafeArray(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.list)) return data.list;
      if (Array.isArray(data.seats)) return data.seats;
      if (Array.isArray(data.guests)) return data.guests;
    }
    return [];
  }

  // ==========================================================================
  // ★ API吸収・自己修復ラッパー (CameraBase の関数不足を強制補完)
  // ==========================================================================
  function getAllCameras() {
    if (window.CameraBase) {
      if (typeof window.CameraBase.getAll === 'function') return window.CameraBase.getAll();
      if (typeof window.CameraBase.exportData === 'function') {
        const d = window.CameraBase.exportData();
        return Array.isArray(d) ? d : (d.list || []);
      }
    }
    return internalCameras;
  }

  function getSelectedCamera() {
    if (window.CameraBase) {
      if (typeof window.CameraBase.getSelected === 'function') return window.CameraBase.getSelected();
      const all = getAllCameras();
      if (typeof window.CameraBase.getSelectedId === 'function') {
        const sid = window.CameraBase.getSelectedId();
        return all.find(c => c.id === sid) || all[0] || null;
      }
      return all[0] || null;
    }
    return internalCameras.find(c => c.id === internalSelectedId) || internalCameras[0] || null;
  }

  function setSelectedId(id) {
    if (window.CameraBase && typeof window.CameraBase.setSelectedId === 'function') {
      window.CameraBase.setSelectedId(id);
    } else {
      internalSelectedId = id;
    }
  }

  function addCamera() {
    const roomW = window.room ? window.room.w : 14000;
    const stageY = window.stage ? window.stage.y : 1200;
    const stageD = window.stage ? window.stage.d : 3000;
    
    triggerHistory();
    let newCam = null;

    if (window.CameraBase && typeof window.CameraBase.addCamera === 'function') {
      newCam = window.CameraBase.addCamera(roomW, stageY, stageD);
    } else if (window.CameraBase && typeof window.CameraBase.exportData === 'function' && typeof window.CameraBase.importData === 'function') {
      let data = window.CameraBase.exportData();
      let arr = Array.isArray(data) ? data : (data.list || []);
      let num = arr.length + 1;
      newCam = {
        id: 'CAM' + Date.now(), name: 'CAM ' + num, model: 'nx5r',
        x: Math.round(roomW / 2), y: Math.round(stageY + stageD + 10000), lensH: 1650,
        fov: 40, shotType: 'stage_ff', targetGuestId: '', platW: 1000, platD: 1000, platH: 400, pan: 0, tilt: 0
      };
      arr.push(newCam);
      window.CameraBase.importData(Array.isArray(data) ? arr : { list: arr });
      setSelectedId(newCam.id);
    } else {
      let num = internalCameras.length + 1;
      newCam = {
        id: 'CAM' + Date.now(), name: 'CAM ' + num, model: 'nx5r',
        x: Math.round(roomW / 2), y: Math.round(stageY + stageD + 10000), lensH: 1650,
        fov: 40, shotType: 'stage_ff', targetGuestId: '', platW: 1000, platD: 1000, platH: 400, pan: 0, tilt: 0
      };
      internalCameras.push(newCam);
      internalSelectedId = newCam.id;
    }

    updateUI();
    triggerRender();
  }

  function deleteSelectedCamera() {
    const all = getAllCameras();
    if (all.length <= 1) return alert('これ以上削除できません。');
    triggerHistory();

    if (window.CameraBase && typeof window.CameraBase.deleteSelected === 'function') {
      window.CameraBase.deleteSelected();
    } else if (window.CameraBase && typeof window.CameraBase.exportData === 'function' && typeof window.CameraBase.importData === 'function') {
      let sel = getSelectedCamera();
      if (!sel) return;
      let data = window.CameraBase.exportData();
      let arr = Array.isArray(data) ? data : (data.list || []);
      let newArr = arr.filter(c => c.id !== sel.id);
      window.CameraBase.importData(Array.isArray(data) ? newArr : { list: newArr });
      setSelectedId(newArr[0]?.id);
    } else {
      internalCameras = internalCameras.filter(c => c.id !== internalSelectedId);
      internalSelectedId = internalCameras[0]?.id || null;
    }

    updateUI();
    triggerRender();
  }

  // ==========================================================================
  // ★ 内蔵アングル計算エンジン (CameraAngleが無い場合でも描画を止めないための安全装置)
  // ==========================================================================
  function computeAim(cam, stage, guests, backPanel, cameraModels) {
    if (window.CameraAngle && typeof window.CameraAngle.calculateAimAndFov === 'function') {
      return window.CameraAngle.calculateAimAndFov(cam, stage, guests, backPanel, cameraModels);
    }
    const st = stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
    let targetX = st.x + st.w / 2;
    let targetY = st.y + st.d;
    let targetZ = st.h + 1200;
    let calcFov = cam.fov || 40;
    let status = 'ok';
    const models = cameraModels || { nx5r: { name: 'Sony HXR-NX5R', minFov: 3.6, maxFov: 64.5 } };
    const modelDef = models[cam.model || 'nx5r'] || models.nx5r || { name: 'Manual', minFov: 0.5, maxFov: 120.0 };
    let reqWidth = 0;
    let dist = Math.hypot(targetX - cam.x, targetY - cam.y);

    const gList = Array.isArray(guests) ? guests : (guests && guests.list ? guests.list : []);
    if (cam.shotType === 'guest_single' && cam.targetGuestId) {
      const g = gList.find(item => item.id === cam.targetGuestId);
      if (g) {
        targetX = g.x; targetY = g.y; targetZ = st.h + (g.h || 1200);
        dist = Math.hypot(targetX - cam.x, targetY - cam.y);
        reqWidth = 800;
        calcFov = Math.max(0.5, (2 * Math.atan((reqWidth / 2) / dist)) * (180 / Math.PI));
        if (calcFov < modelDef.minFov) { calcFov = modelDef.minFov; status = 'tele_limit'; }
        else if (calcFov > modelDef.maxFov) { calcFov = modelDef.maxFov; status = 'wide_limit'; }
      }
    } else if (cam.shotType === 'stage_ff') {
      reqWidth = st.w;
      calcFov = Math.max(0.5, (2 * Math.atan((reqWidth / 2) / dist)) * (180 / Math.PI)) + 4;
      if (calcFov > modelDef.maxFov) { calcFov = modelDef.maxFov; status = 'wide_limit'; }
    }

    let hAngle = Math.atan2(targetY - cam.y, targetX - cam.x);
    if (cam.shotType === 'manual_angle') {
      hAngle = ((cam.pan || 0) - 90) * (Math.PI / 180);
      calcFov = cam.fov;
    }
    if (cam.shotType !== 'manual' && cam.shotType !== 'manual_angle') cam.fov = calcFov;

    const vFov = 2 * Math.atan(Math.tan((calcFov * Math.PI) / 360) * (9 / 16)) * (180 / Math.PI);
    return { targetX, targetY, targetZ, fov: calcFov, vFov, angle: hAngle, hAngle, status, modelDef, reqWidth, dist };
  }

  function simulateHeight(cam, aimInfo, seats, totalHeadZ) {
    if (window.CameraAngle && typeof window.CameraAngle.simulateHeightClearance === 'function') {
      return window.CameraAngle.simulateHeightClearance(cam, aimInfo, seats, totalHeadZ);
    }
    let maxRequiredCamZ = 0;
    let blockedSeatCount = 0;
    const currentCamZ = cam.lensH || 1650;
    (seats || []).forEach(s => {
      if (s.y < cam.y && s.y > aimInfo.targetY) {
        const t = (s.y - cam.y) / (aimInfo.targetY - cam.y);
        if (t > 0 && t < 1) {
          const rayXAtSeat = cam.x + t * (aimInfo.targetX - cam.x);
          if (Math.abs(s.x - rayXAtSeat) < 160) {
            const rayZAtSeat = currentCamZ + t * (aimInfo.targetZ - currentCamZ);
            if (rayZAtSeat < totalHeadZ) blockedSeatCount++;
            const reqCamZ = (totalHeadZ - t * aimInfo.targetZ) / (1 - t);
            if (reqCamZ > maxRequiredCamZ) maxRequiredCamZ = reqCamZ;
          }
        }
      }
    });
    const diffZ = maxRequiredCamZ > currentCamZ ? (maxRequiredCamZ - currentCamZ) : 0;
    return { blockedCount: blockedSeatCount, requiredCamZ: maxRequiredCamZ, diffZ, isClear: blockedSeatCount === 0 };
  }

  function checkHeadBlock(cam, aimInfo, seats, totalHeadZ) {
    if (window.CameraAngle && typeof window.CameraAngle.checkHeadBlock === 'function') {
      return window.CameraAngle.checkHeadBlock(cam, aimInfo, seats, totalHeadZ);
    }
    return simulateHeight(cam, aimInfo, seats, totalHeadZ).isClear ? [] : [{ dummy: true }];
  }

  function generateSummaryTextStr(cam, aimInfo, simResult) {
    if (window.CameraAngle && typeof window.CameraAngle.generateSummaryText === 'function') {
      return window.CameraAngle.generateSummaryText(cam, aimInfo, simResult);
    }
    const distM = (aimInfo.dist / 1000).toFixed(1);
    let txt = `【${cam.name} (${aimInfo.modelDef.name}) レポート】\n`;
    txt += `距離: ${distM}m | 要求FOV: ${aimInfo.fov.toFixed(1)}°\nレンズ高: ${cam.lensH || 0}mm\n------------------------------------\n`;
    if (aimInfo.status === 'tele_limit') txt += `🚨 望遠不足 (寄り限界)\n`;
    else if (aimInfo.status === 'wide_limit') txt += `🚨 広角不足 (引き限界)\n`;
    else txt += `✅ 画角適正\n`;
    txt += `\n`;
    if (!simResult.isClear) {
      txt += `⚠️ 前席頭被り発生 (${simResult.blockedCount}席)\n💡 解決策提案: カメラ台（レンズ高）を あと +${Math.ceil(simResult.diffZ)}mm 上げてください。\n`;
    } else {
      txt += `✅ 視界クリア\n`;
    }
    return txt;
  }

  // --- 操作パネルUIのHTML動的構築 ---
  function initUI() {
    const container = document.getElementById('panel-camera') || document.getElementById('panel-cams') || document.getElementById('panel-tab7');
    if (!container) return;

    container.innerHTML = `
      <div class="ui-group">
        <div class="ui-group-title">
          <span>🎥 カメラ機材 & ショット</span>
          <button type="button" class="btn-action" id="btnAddCam" onclick="window.tabCameraModule.addCamera()">＋ 追加</button>
        </div>
        <div class="input-box" style="margin-bottom: 6px;">
          <label>対象カメラ</label>
          <select id="camSelect"></select>
        </div>
        
        <pre id="cameraHyperSummary" style="font-size: 11px; padding: 8px; border-radius: 4px; white-space: pre-wrap; margin-bottom: 8px; line-height: 1.4;"></pre>

        <div class="input-box" style="margin-bottom: 6px;">
          <label style="color:#0284c7;">カメラ機種・レンズ仕様</label>
          <select id="camModel">
            <option value="nx5r">Sony HXR-NX5R (光学20倍)</option>
            <option value="eng_std">ENG 2/3型 標準22倍</option>
            <option value="eng_ext">ENG 2/3型 (2x Ext)</option>
            <option value="box_tele">大型ボックス40倍 (超望遠)</option>
            <option value="manual">マニュアル (広角〜望遠)</option>
          </select>
        </div>
        <div class="input-box" style="margin-bottom: 6px;">
          <label>撮影対象 (ショット)</label>
          <select id="camShotType">
            <option value="stage_ff">🎬 ステージ全景 (FF)</option>
            <option value="guest_group">👥 登壇者全員 (GS)</option>
            <option value="guest_single">👤 登壇者 1人 (WS/BS)</option>
            <option value="manual_angle">⚙️ マニュアル照準・画角</option>
          </select>
        </div>
        <div class="input-box" id="camTargetGuestBox" style="display:none; margin-bottom: 6px;">
          <label>ターゲット登壇者</label>
          <select id="camTargetGuest"></select>
        </div>
        <div class="input-box" style="margin-bottom: 6px;">
          <label>画角 (FOV: <span id="fovValDisplay">40.0</span>°)</label>
          <input type="range" id="camFovSlider" min="0.5" max="120" step="0.1" value="40">
        </div>
      </div>

      <!-- マニュアル角度スライダー -->
      <div class="ui-group" id="camAngleBox" style="display:none;">
        <div class="ui-group-title">首振り角度 (Pan / Tilt)</div>
        <div class="input-box" style="margin-bottom: 4px;">
          <label>パン (左右水平): <span id="camPanDisplay">0</span>°</label>
          <input type="range" id="camPanSlider" min="-90" max="90" step="1" value="0">
        </div>
        <div class="input-box">
          <label>チルト (上下仰俯): <span id="camTiltDisplay">0</span>°</label>
          <input type="range" id="camTiltSlider" min="-45" max="45" step="1" value="0">
        </div>
      </div>

      <div class="ui-group">
        <div class="ui-group-title">カメラ位置 & イントレ台</div>
        <div class="input-row" style="margin-bottom: 6px;">
          <div class="input-box"><label>位置 X (mm)</label><input type="number" id="camX" step="100"></div>
          <div class="input-box"><label>位置 Y (mm)</label><input type="number" id="camY" step="100"></div>
        </div>
        <div class="input-row" style="margin-bottom: 6px;">
          <div class="input-box"><label>レンズ高 (Z mm)</label><input type="number" id="camH" step="50"></div>
          <div class="input-box"><label>台高 (H mm)</label><input type="number" id="platH" step="50"></div>
        </div>
        <div class="input-row" style="margin-bottom: 8px;">
          <div class="input-box"><label>台幅 W (mm)</label><input type="number" id="platW" step="100"></div>
          <div class="input-box"><label>台奥 D (mm)</label><input type="number" id="platD" step="100"></div>
        </div>
        <div class="input-box" style="margin-bottom: 6px;">
          <label style="color:#0284c7;">最後尾席からの距離 (mm)</label>
          <div style="display:flex; gap:6px;">
            <input type="number" id="camDistFromLastRow" value="2000" step="100" style="flex:1;">
            <button type="button" class="btn-action" id="btnAlignLastRow">最後尾から配置</button>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:8px;">
          <button type="button" class="btn-mini-danger" id="btnDeleteCam" onclick="window.tabCameraModule.deleteSelectedCamera()">このカメラを削除</button>
        </div>
      </div>
    `;

    bindEvents();
    if (getAllCameras().length > 0) updateUI();
  }

  // --- イベントリスナー接続 ---
  function bindEvents() {
    const bind = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, handler);
    };

    bind('btnAddCam', 'click', addCamera);
    bind('btnDeleteCam', 'click', deleteSelectedCamera);

    bind('camSelect', 'change', e => {
      setSelectedId(e.target.value);
      updateUI();
      triggerRender();
    });

    bind('camModel', 'change', e => {
      const sel = getSelectedCamera();
      if (!sel) return;
      sel.model = e.target.value;
      const models = (window.CameraBase && window.CameraBase.CAMERA_MODELS) ? window.CameraBase.CAMERA_MODELS : {};
      const modelDef = models[sel.model];
      if (modelDef) sel.fov = Math.max(modelDef.minFov, Math.min(modelDef.maxFov, sel.fov));
      updateUI();
      triggerHistory();
      triggerRender();
    });

    bind('camShotType', 'change', e => {
      const sel = getSelectedCamera();
      if (sel) sel.shotType = e.target.value;
      updateUI();
      triggerHistory();
      triggerRender();
    });

    bind('camTargetGuest', 'change', e => {
      const sel = getSelectedCamera();
      if (sel) sel.targetGuestId = e.target.value;
      updateUI();
      triggerHistory();
      triggerRender();
    });

    bind('camFovSlider', 'input', e => {
      const sel = getSelectedCamera();
      if (!sel) return;
      sel.fov = parseFloat(e.target.value) || 40;
      sel.shotType = 'manual_angle';
      const typeSel = document.getElementById('camShotType');
      if (typeSel) typeSel.value = 'manual_angle';
      updateUI();
      triggerRender();
    });

    bind('camPanSlider', 'input', e => {
      const sel = getSelectedCamera();
      if (sel) sel.pan = parseFloat(e.target.value) || 0;
      updateUI();
      triggerRender();
    });

    bind('camTiltSlider', 'input', e => {
      const sel = getSelectedCamera();
      if (sel) sel.tilt = parseFloat(e.target.value) || 0;
      updateUI();
      triggerRender();
    });

    const numSync = (id, prop) => {
      bind(id, 'change', e => {
        const sel = getSelectedCamera();
        if (sel) sel[prop] = parseFloat(e.target.value) || 0;
        updateUI();
        triggerHistory();
        triggerRender();
      });
    };

    numSync('camX', 'x'); numSync('camY', 'y'); numSync('camH', 'lensH');
    numSync('platW', 'platW'); numSync('platD', 'platD'); numSync('platH', 'platH');

    bind('btnAlignLastRow', 'click', () => {
      const sel = getSelectedCamera();
      if (!sel) return;
      const dist = parseFloat(document.getElementById('camDistFromLastRow')?.value) || 2000;
      const rawSeats = window.tabSeatsModule ? window.tabSeatsModule.exportData() : (window.seats || []);
      const seats = getSafeArray(rawSeats);

      if (window.CameraBase && typeof window.CameraBase.alignFromLastRow === 'function') {
        window.CameraBase.alignFromLastRow(sel, dist, seats);
      } else {
        let lastRowY = 15000;
        if (seats.length > 0) lastRowY = Math.max(...seats.map(s => s.y)) + 240;
        sel.y = Math.round(lastRowY + dist + (sel.platD || 1000) / 2);
      }
      triggerHistory();
      updateUI();
      triggerRender();
    });
  }

  // --- シミュレーションサマリー表示 ---
  function updateCameraSummaryUI() {
    const cam = getSelectedCamera();
    if (!cam) return;

    const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
    const guests = getSafeArray(window.tabGuestsModule ? window.tabGuestsModule.exportData() : window.guests);
    const seats = getSafeArray(window.tabSeatsModule ? window.tabSeatsModule.exportData() : window.seats);
    const backPanel = window.backPanel || { enabled: true, h: 2400 };
    const totalHeadZ = window.totalHeadZ || 1270;
    const cameraModels = (window.CameraBase && window.CameraBase.CAMERA_MODELS) ? window.CameraBase.CAMERA_MODELS : {};

    try {
      // ★ 外部エンジンが無ければ内蔵フォールバック関数を利用
      const aimInfo = computeAim(cam, stage, guests, backPanel, cameraModels);
      const simResult = simulateHeight(cam, aimInfo, seats, totalHeadZ);
      const summaryText = generateSummaryTextStr(cam, aimInfo, simResult);

      const summaryEl = document.getElementById('cameraHyperSummary');
      if (summaryEl) {
        summaryEl.innerText = summaryText;
        if (!simResult.isClear || aimInfo.status !== 'ok') {
          summaryEl.style.color = '#dc2626';
          summaryEl.style.backgroundColor = '#fef2f2';
          summaryEl.style.border = '1px solid #f87171';
        } else {
          summaryEl.style.color = '#16a34a';
          summaryEl.style.backgroundColor = '#f0fdf4';
          summaryEl.style.border = '1px solid #4ade80';
        }
      }
    } catch(err) {
      console.warn("サマリー計算スキップ:", err);
    }
  }

  // --- UI 入力値・選択肢の更新 ---
  function updateUI() {
    const sel = getSelectedCamera();
    const select = document.getElementById('camSelect');
    if (!select) return;

    select.innerHTML = '';
    const allCams = getAllCameras();
    allCams.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      select.appendChild(opt);
    });

    const gSelect = document.getElementById('camTargetGuest');
    if (gSelect) {
      gSelect.innerHTML = '';
      const guests = getSafeArray(window.tabGuestsModule ? window.tabGuestsModule.exportData() : window.guests);
      guests.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.name || g.id;
        gSelect.appendChild(opt);
      });
    }

    if (!sel) return;
    select.value = sel.id;

    const el = id => document.getElementById(id);
    if (el('camModel')) el('camModel').value = sel.model || 'nx5r';
    if (el('camShotType')) el('camShotType').value = sel.shotType;
    if (el('camX')) el('camX').value = Math.round(sel.x);
    if (el('camY')) el('camY').value = Math.round(sel.y);
    if (el('camH')) el('camH').value = Math.round(sel.lensH || 1650);

    const models = (window.CameraBase && window.CameraBase.CAMERA_MODELS) ? window.CameraBase.CAMERA_MODELS : {};
    const modelDef = models[sel.model || 'nx5r'] || { minFov: 0.5, maxFov: 120 };
    const slider = el('camFovSlider');
    if (slider) {
      slider.min = modelDef.minFov; slider.max = modelDef.maxFov; slider.value = sel.fov;
    }
    if (el('fovValDisplay')) el('fovValDisplay').innerText = (Math.round((sel.fov || 40) * 10) / 10).toFixed(1);

    if (el('platW')) el('platW').value = Math.round(sel.platW);
    if (el('platD')) el('platD').value = Math.round(sel.platD);
    if (el('platH')) el('platH').value = Math.round(sel.platH);

    const gBox = el('camTargetGuestBox');
    if (gBox) {
      gBox.style.display = (sel.shotType === 'guest_single') ? 'flex' : 'none';
      if (sel.shotType === 'guest_single' && gSelect) gSelect.value = sel.targetGuestId || '';
    }

    const angleBox = el('camAngleBox');
    if (angleBox) {
      angleBox.style.display = (sel.shotType === 'manual_angle') ? 'flex' : 'none';
      if (sel.shotType === 'manual_angle') {
        if (el('camPanSlider')) el('camPanSlider').value = sel.pan || 0;
        if (el('camTiltSlider')) el('camTiltSlider').value = sel.tilt || 0;
        if (el('camPanDisplay')) el('camPanDisplay').innerText = ((sel.pan || 0) > 0 ? '+' : '') + (sel.pan || 0);
        if (el('camTiltDisplay')) el('camTiltDisplay').innerText = ((sel.tilt || 0) > 0 ? '+' : '') + (sel.tilt || 0);
      }
    }

    updateCameraSummaryUI();
  }

  // --- 平面図描画 ---
  function drawTop(ctx) {
    const cams = getAllCameras();
    if (cams.length === 0) return;

    const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
    const guests = getSafeArray(window.tabGuestsModule ? window.tabGuestsModule.exportData() : window.guests);
    const seats = getSafeArray(window.tabSeatsModule ? window.tabSeatsModule.exportData() : window.seats);
    const backPanel = window.backPanel || { enabled: true, h: 2400 };
    const cameraModels = (window.CameraBase && window.CameraBase.CAMERA_MODELS) ? window.CameraBase.CAMERA_MODELS : {};
    const totalHeadZ = window.totalHeadZ || 1270;
    const selId = getSelectedCamera()?.id;

    cams.forEach(cam => {
      let aim;
      try { 
        // ★ 外部エンジンが未定義でも内蔵エンジンで計算処理を続行！
        aim = computeAim(cam, stage, guests, backPanel, cameraModels); 
      } catch(e) { return; }
      const isSelected = (cam.id === selId);

      ctx.save();
      ctx.fillStyle = isSelected ? 'rgba(236, 72, 153, 0.25)' : 'rgba(203, 213, 225, 0.4)';
      ctx.strokeStyle = isSelected ? '#ec4899' : '#64748b';
      ctx.lineWidth = isSelected ? 30 : 20;
      ctx.fillRect(cam.x - cam.platW / 2, cam.y - cam.platD / 2, cam.platW, cam.platD);
      ctx.strokeRect(cam.x - cam.platW / 2, cam.y - cam.platD / 2, cam.platW, cam.platD);

      const showFov = window.displaySettings ? (window.displaySettings.showCamFov ?? window.displaySettings.showFov ?? true) : true;
      if (showFov) {
        const radLeft = aim.hAngle - (aim.fov / 2) * (Math.PI / 180);
        const radRight = aim.hAngle + (aim.fov / 2) * (Math.PI / 180);
        const dist = Math.hypot(aim.targetX - cam.x, aim.targetY - cam.y) + 3000;

        ctx.beginPath();
        ctx.moveTo(cam.x, cam.y);
        ctx.lineTo(cam.x + dist * Math.cos(radLeft), cam.y + dist * Math.sin(radLeft));
        ctx.arc(cam.x, cam.y, dist, radLeft, radRight);
        ctx.closePath();
        ctx.fillStyle = aim.status !== 'ok' ? 'rgba(239, 68, 68, 0.12)' : (isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.08)');
        ctx.fill();
        ctx.strokeStyle = aim.status !== 'ok' ? '#ef4444' : (isSelected ? 'rgba(37, 99, 235, 0.6)' : 'rgba(100, 116, 139, 0.3)');
        ctx.lineWidth = 15;
        ctx.stroke();

        const blocked = checkHeadBlock(cam, aim, seats, totalHeadZ);
        ctx.beginPath(); ctx.moveTo(cam.x, cam.y); ctx.lineTo(aim.targetX, aim.targetY);
        ctx.strokeStyle = blocked.length > 0 ? '#ef4444' : '#22c55e';
        ctx.lineWidth = isSelected ? 30 : 20; ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(cam.x, cam.y, 250, 0, Math.PI * 2);
      ctx.fillStyle = '#a855f7'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 40; ctx.stroke();
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 240px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(cam.name, cam.x, cam.y + cam.platD / 2 + 300);
      ctx.restore();
    });
  }

  // --- 立面図描画 ---
  function drawCameraSide(ctx) {
    const sel = getSelectedCamera();
    if (!sel) return;

    const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
    const guests = getSafeArray(window.tabGuestsModule ? window.tabGuestsModule.exportData() : window.guests);
    const seats = getSafeArray(window.tabSeatsModule ? window.tabSeatsModule.exportData() : window.seats);
    const backPanel = window.backPanel || { enabled: true, h: 2400 };
    const cameraModels = (window.CameraBase && window.CameraBase.CAMERA_MODELS) ? window.CameraBase.CAMERA_MODELS : {};
    const totalHeadZ = window.totalHeadZ || 1270;

    let aim;
    try { 
      // ★ 外部エンジンが未定義でも内蔵エンジンで計算処理を続行！
      aim = computeAim(sel, stage, guests, backPanel, cameraModels); 
    } catch(e) { return; }

    const camPosY = sel.y;
    const camPosZ = -(sel.lensH || 1650);
    const tgtPosY = aim.targetY;
    const tgtPosZ = -aim.targetZ;

    ctx.save();
    ctx.fillStyle = '#ec4899'; ctx.fillRect(camPosY - sel.platD / 2, -sel.platH, sel.platD, sel.platH);
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 30; ctx.beginPath();
    ctx.moveTo(camPosY, -sel.platH); ctx.lineTo(camPosY, camPosZ); ctx.stroke();
    ctx.beginPath(); ctx.arc(camPosY, camPosZ, 180, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7'; ctx.fill();

    const centerAngle = Math.atan2(tgtPosZ - camPosZ, tgtPosY - camPosY);
    const halfVFovRad = ((aim.vFov / 2) * Math.PI) / 180;
    const topRayAngle = centerAngle - halfVFovRad;
    const bottomRayAngle = centerAngle + halfVFovRad;
    const rayLength = 22000;

    ctx.beginPath(); ctx.moveTo(camPosY, camPosZ);
    ctx.lineTo(camPosY + rayLength * Math.cos(topRayAngle), camPosZ + rayLength * Math.sin(topRayAngle));
    ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 20; ctx.setLineDash([80, 40]); ctx.stroke();

    const blocked = checkHeadBlock(sel, aim, seats, totalHeadZ);
    ctx.beginPath(); ctx.moveTo(camPosY, camPosZ);
    ctx.lineTo(camPosY + rayLength * Math.cos(bottomRayAngle), camPosZ + rayLength * Math.sin(bottomRayAngle));
    ctx.strokeStyle = blocked.length > 0 ? '#ef4444' : '#22c55e';
    ctx.lineWidth = blocked.length > 0 ? 35 : 20; ctx.setLineDash([]); ctx.stroke();
    ctx.restore();
  }

  // --- ドラッグ判定 ---
  function hitTest(wx, wy) {
    const cams = getAllCameras();
    for (let i = cams.length - 1; i >= 0; i--) {
      const c = cams[i];
      if (Math.hypot(wx - c.x, wy - c.y) < 350) {
        setSelectedId(c.id); updateUI();
        if (window.switchTab) window.switchTab('camera');
        return { type: 'camera_head', cam: c, offsetX: wx - c.x, offsetY: wy - c.y };
      }
      if (wx >= c.x - c.platW / 2 && wx <= c.x + c.platW / 2 && wy >= c.y - c.platD / 2 && wy <= c.y + c.platD / 2) {
        setSelectedId(c.id); updateUI();
        if (window.switchTab) window.switchTab('camera');
        return { type: 'camera_platform', cam: c, offsetX: wx - c.x, offsetY: wy - c.y };
      }
    }
    return null;
  }

  function handleDrag(target, wx, wy) {
    if (target.type === 'camera_head' || target.type === 'camera_platform') {
      target.cam.x = Math.round(wx - (target.offsetX || 0));
      target.cam.y = Math.round(wy - (target.offsetY || 0));
      updateUI();
    }
  }

  // --- グローバル公開 ---
  window.addCamera = addCamera;
  window.deleteSelectedCamera = deleteSelectedCamera;
  window.alignLastRow = () => { document.getElementById('btnAlignLastRow')?.click(); };

  // --- 初期化 ---
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  return {
    initUI, updateUI, addCamera, deleteSelectedCamera,
    drawTop, drawCameraSide, drawSide: drawCameraSide, hitTest, handleDrag,
    exportData: () => getAllCameras(),
    importData: (d) => {
      if (window.CameraBase && typeof window.CameraBase.importData === 'function') {
        window.CameraBase.importData(d);
      } else {
        internalCameras = Array.isArray(d) ? d : (d.list || []);
        internalSelectedId = internalCameras[0]?.id;
      }
      updateUI(); triggerRender();
    }
  };
})();