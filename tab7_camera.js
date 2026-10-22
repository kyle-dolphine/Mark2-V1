/**
 * tab7_camera.js - カメラ親モジュール (統括オーケストレーター)
 * 依存: camera_angle.js, camera_base.js
 */
window.tabCameraModule = (function () {
  'use strict';

  // --- 操作パネルUIのHTML動的構築 ---
  function initUI() {
    const container = document.getElementById('panel-camera');
    if (!container) return;

    container.innerHTML = `
      <div class="ui-group">
        <div class="ui-group-title">
          <span>🎥 カメラ機材 & ショット</span>
          <button type="button" class="btn-action" id="btnAddCam">＋ 追加</button>
        </div>
        <div class="input-box" style="margin-bottom: 6px;">
          <label>対象カメラ</label>
          <select id="camSelect"></select>
        </div>
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
          <div class="input-box">
            <label>位置 X (mm)</label>
            <input type="number" id="camX" step="100">
          </div>
          <div class="input-box">
            <label>位置 Y (mm)</label>
            <input type="number" id="camY" step="100">
          </div>
        </div>
        <div class="input-row" style="margin-bottom: 6px;">
          <div class="input-box">
            <label>レンズ高 (Z mm)</label>
            <input type="number" id="camH" step="50">
          </div>
          <div class="input-box">
            <label>台高 (H mm)</label>
            <input type="number" id="platH" step="50">
          </div>
        </div>
        <div class="input-row" style="margin-bottom: 8px;">
          <div class="input-box">
            <label>台幅 W (mm)</label>
            <input type="number" id="platW" step="100">
          </div>
          <div class="input-box">
            <label>台奥 D (mm)</label>
            <input type="number" id="platD" step="100">
          </div>
        </div>
        <div class="input-box" style="margin-bottom: 6px;">
          <label style="color:#0284c7;">最後尾席からの距離 (mm)</label>
          <div style="display:flex; gap:6px;">
            <input type="number" id="camDistFromLastRow" value="2000" step="100" style="flex:1;">
            <button type="button" class="btn-action" id="btnAlignLastRow">最後尾から配置</button>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:8px;">
          <button type="button" class="btn-mini-danger" id="btnDeleteCam">このカメラを削除</button>
        </div>
      </div>
    `;

    bindEvents();
    updateUI();
  }

  // --- イベントバインド ---
  function bindEvents() {
    const bind = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, handler);
    };

    bind('camSelect', 'change', e => {
      if (window.CameraBase) window.CameraBase.setSelectedId(e.target.value);
      updateUI();
      if (window.requestRender) window.requestRender();
    });

    bind('camModel', 'change', e => {
      const sel = window.CameraBase ? window.CameraBase.getSelected() : null;
      if (!sel) return;
      sel.model = e.target.value;
      const modelDef = window.CameraBase.CAMERA_MODELS[sel.model];
      if (modelDef) {
        sel.fov = Math.max(modelDef.minFov, Math.min(modelDef.maxFov, sel.fov));
      }
      updateUI();
      if (window.saveHistory) window.saveHistory();
      if (window.requestRender) window.requestRender();
    });

    bind('camShotType', 'change', e => {
      const sel = window.CameraBase ? window.CameraBase.getSelected() : null;
      if (!sel) return;
      sel.shotType = e.target.value;
      updateUI();
      if (window.saveHistory) window.saveHistory();
      if (window.requestRender) window.requestRender();
    });

    bind('camTargetGuest', 'change', e => {
      const sel = window.CameraBase ? window.CameraBase.getSelected() : null;
      if (!sel) return;
      sel.targetGuestId = e.target.value;
      if (window.saveHistory) window.saveHistory();
      if (window.requestRender) window.requestRender();
    });

    bind('camFovSlider', 'input', e => {
      const sel = window.CameraBase ? window.CameraBase.getSelected() : null;
      if (!sel) return;
      sel.fov = parseFloat(e.target.value) || 40;
      sel.shotType = 'manual_angle';
      const typeSel = document.getElementById('camShotType');
      if (typeSel) typeSel.value = 'manual_angle';
      const fovDisplay = document.getElementById('fovValDisplay');
      if (fovDisplay) fovDisplay.innerText = sel.fov.toFixed(1);
      updateUI();
      if (window.requestRender) window.requestRender();
    });

    bind('camPanSlider', 'input', e => {
      const sel = window.CameraBase ? window.CameraBase.getSelected() : null;
      if (!sel) return;
      sel.pan = parseFloat(e.target.value) || 0;
      const panDisp = document.getElementById('camPanDisplay');
      if (panDisp) panDisp.innerText = (sel.pan > 0 ? '+' : '') + sel.pan;
      if (window.requestRender) window.requestRender();
    });

    bind('camTiltSlider', 'input', e => {
      const sel = window.CameraBase ? window.CameraBase.getSelected() : null;
      if (!sel) return;
      sel.tilt = parseFloat(e.target.value) || 0;
      const tiltDisp = document.getElementById('camTiltDisplay');
      if (tiltDisp) tiltDisp.innerText = (sel.tilt > 0 ? '+' : '') + sel.tilt;
      if (window.requestRender) window.requestRender();
    });

    const numSync = (id, prop) => {
      bind(id, 'change', e => {
        const sel = window.CameraBase ? window.CameraBase.getSelected() : null;
        if (!sel) return;
        sel[prop] = parseFloat(e.target.value) || 0;
        if (window.saveHistory) window.saveHistory();
        if (window.requestRender) window.requestRender();
      });
    };

    numSync('camX', 'x');
    numSync('camY', 'y');
    numSync('camH', 'lensH');
    numSync('platW', 'platW');
    numSync('platD', 'platD');
    numSync('platH', 'platH');

    bind('btnAddCam', 'click', () => {
      if (!window.CameraBase) return;
      const roomW = window.room ? window.room.w : 14000;
      const stageY = window.stage ? window.stage.y : 1200;
      const stageD = window.stage ? window.stage.d : 3000;
      window.CameraBase.addCamera(roomW, stageY, stageD);
      if (window.saveHistory) window.saveHistory();
      updateUI();
      if (window.requestRender) window.requestRender();
    });

    bind('btnDeleteCam', 'click', () => {
      if (!window.CameraBase) return;
      if (window.CameraBase.getAll().length <= 1) {
        alert('これ以上削除できません。');
        return;
      }
      window.CameraBase.deleteSelected();
      if (window.saveHistory) window.saveHistory();
      updateUI();
      if (window.requestRender) window.requestRender();
    });

    bind('btnAlignLastRow', 'click', () => {
      if (!window.CameraBase) return;
      const sel = window.CameraBase.getSelected();
      if (!sel) return;
      const dist = parseFloat(document.getElementById('camDistFromLastRow')?.value) || 2000;
      const seats = window.tabSeatsModule ? window.tabSeatsModule.exportData() : (window.seats || []);
      window.CameraBase.alignFromLastRow(sel, dist, seats);
      if (window.saveHistory) window.saveHistory();
      updateUI();
      if (window.requestRender) window.requestRender();
    });
  }

  // --- UI 入力値・選択肢の更新 ---
  function updateUI() {
    if (!window.CameraBase) return;
    const sel = window.CameraBase.getSelected();
    const select = document.getElementById('camSelect');
    if (!select) return;

    select.innerHTML = '';
    window.CameraBase.getAll().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      select.appendChild(opt);
    });

    const gSelect = document.getElementById('camTargetGuest');
    if (gSelect) {
      gSelect.innerHTML = '';
      const guests = window.tabGuestsModule ? window.tabGuestsModule.exportData() : [];
      const gList = Array.isArray(guests) ? guests : (guests.list || []);
      gList.forEach(g => {
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
    if (el('camH')) el('camH').value = Math.round(sel.lensH);

    const modelDef = window.CameraBase.CAMERA_MODELS[sel.model || 'nx5r'];
    const slider = el('camFovSlider');
    if (slider && modelDef) {
      slider.min = modelDef.minFov;
      slider.max = modelDef.maxFov;
      slider.value = sel.fov;
    }
    if (el('fovValDisplay')) el('fovValDisplay').innerText = (Math.round(sel.fov * 10) / 10).toFixed(1);

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
        if (el('camPanDisplay')) el('camPanDisplay').innerText = (sel.pan > 0 ? '+' : '') + (sel.pan || 0);
        if (el('camTiltDisplay')) el('camTiltDisplay').innerText = (sel.tilt > 0 ? '+' : '') + (sel.tilt || 0);
      }
    }
  }

  // --- 平面図描画 (Top View) ---
  function drawTop(ctx) {
    if (!window.CameraBase || !window.CameraAngle) return;
    const cams = window.CameraBase.getAll();
    const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
    const guests = window.tabGuestsModule ? window.tabGuestsModule.exportData() : [];
    const seats = window.tabSeatsModule ? window.tabSeatsModule.exportData() : (window.seats || []);

    cams.forEach(cam => {
      const aim = window.CameraAngle.calculateAimAndFov(cam, stage, guests, window.CameraBase.CAMERA_MODELS);
      const isSelected = (cam.id === window.CameraBase.getSelected()?.id);

      ctx.save();
      ctx.fillStyle = isSelected ? 'rgba(236, 72, 153, 0.25)' : 'rgba(203, 213, 225, 0.4)';
      ctx.strokeStyle = isSelected ? '#ec4899' : '#64748b';
      ctx.lineWidth = isSelected ? 30 : 20;
      ctx.fillRect(cam.x - cam.platW / 2, cam.y - cam.platD / 2, cam.platW, cam.platD);
      ctx.strokeRect(cam.x - cam.platW / 2, cam.y - cam.platD / 2, cam.platW, cam.platD);

      if (window.displaySettings && window.displaySettings.showFov) {
        const radLeft = aim.hAngle - (aim.fov / 2) * (Math.PI / 180);
        const radRight = aim.hAngle + (aim.fov / 2) * (Math.PI / 180);
        const dist = Math.hypot(aim.targetX - cam.x, aim.targetY - cam.y) + 3000;

        ctx.beginPath();
        ctx.moveTo(cam.x, cam.y);
        ctx.lineTo(cam.x + dist * Math.cos(radLeft), cam.y + dist * Math.sin(radLeft));
        ctx.arc(cam.x, cam.y, dist, radLeft, radRight);
        ctx.closePath();
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.08)';
        ctx.fill();
        ctx.strokeStyle = isSelected ? 'rgba(37, 99, 235, 0.6)' : 'rgba(100, 116, 139, 0.3)';
        ctx.lineWidth = 15;
        ctx.stroke();

        const blocked = window.CameraAngle.checkHeadBlock(cam, aim, seats);
        ctx.beginPath();
        ctx.moveTo(cam.x, cam.y);
        ctx.lineTo(aim.targetX, aim.targetY);
        ctx.strokeStyle = blocked.length > 0 ? '#ef4444' : '#22c55e';
        ctx.lineWidth = isSelected ? 30 : 20;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cam.x, cam.y, 250, 0, Math.PI * 2);
      ctx.fillStyle = '#a855f7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 40;
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 240px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cam.name, cam.x, cam.y + cam.platD / 2 + 300);
      ctx.restore();
    });
  }

  // --- 立面図描画 (Side View: コアエンジンの床面 Z=0 基準) ---
  function drawCameraSide(ctx) {
    if (!window.CameraBase || !window.CameraAngle) return;
    const sel = window.CameraBase.getSelected();
    if (!sel) return;

    const stage = window.stage || { h: 800 };
    const guests = window.tabGuestsModule ? window.tabGuestsModule.exportData() : [];
    const seats = window.tabSeatsModule ? window.tabSeatsModule.exportData() : (window.seats || []);
    const aim = window.CameraAngle.calculateAimAndFov(sel, stage, guests, window.CameraBase.CAMERA_MODELS);

    const camPosY = sel.y;
    const camPosZ = -sel.lensH;
    const tgtPosY = aim.targetY;
    const tgtPosZ = -aim.targetZ;

    ctx.save();

    ctx.fillStyle = '#ec4899';
    ctx.fillRect(camPosY - sel.platD / 2, -sel.platH, sel.platD, sel.platH);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(camPosY, -sel.platH);
    ctx.lineTo(camPosY, camPosZ);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(camPosY, camPosZ, 180, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();

    const centerAngle = Math.atan2(tgtPosZ - camPosZ, tgtPosY - camPosY);
    const halfVFovRad = ((aim.vFov / 2) * Math.PI) / 180;
    const topRayAngle = centerAngle - halfVFovRad;
    const bottomRayAngle = centerAngle + halfVFovRad;
    const rayLength = 22000;

    ctx.beginPath();
    ctx.moveTo(camPosY, camPosZ);
    ctx.lineTo(camPosY + rayLength * Math.cos(topRayAngle), camPosZ + rayLength * Math.sin(topRayAngle));
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 20;
    ctx.setLineDash([80, 40]);
    ctx.stroke();

    const blocked = window.CameraAngle.checkHeadBlock(sel, aim, seats);
    ctx.beginPath();
    ctx.moveTo(camPosY, camPosZ);
    ctx.lineTo(camPosY + rayLength * Math.cos(bottomRayAngle), camPosZ + rayLength * Math.sin(bottomRayAngle));
    ctx.strokeStyle = blocked.length > 0 ? '#ef4444' : '#22c55e';
    ctx.lineWidth = blocked.length > 0 ? 35 : 20;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.restore();
  }

  // --- ドラッグ判定 ---
  function hitTest(wx, wy) {
    if (!window.CameraBase) return null;
    const cams = window.CameraBase.getAll();
    for (let i = cams.length - 1; i >= 0; i--) {
      const c = cams[i];
      if (Math.hypot(wx - c.x, wy - c.y) < 350) {
        window.CameraBase.setSelectedId(c.id);
        updateUI();
        if (window.switchTab) window.switchTab('camera');
        return { type: 'camera_head', cam: c, offsetX: wx - c.x, offsetY: wy - c.y };
      }
      if (
        wx >= c.x - c.platW / 2 && wx <= c.x + c.platW / 2 &&
        wy >= c.y - c.platD / 2 && wy <= c.y + c.platD / 2
      ) {
        window.CameraBase.setSelectedId(c.id);
        updateUI();
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

  // --- スクリプト読み込み時の自動初期化トリガー ---
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  return {
    initUI,
    updateUI,
    drawTop,
    drawCameraSide,
    drawSide: drawCameraSide,
    hitTest,
    handleDrag,
    exportData: () => (window.CameraBase ? window.CameraBase.exportData() : []),
    importData: (d) => {
      if (window.CameraBase) window.CameraBase.importData(d);
      updateUI();
    }
  };
})();