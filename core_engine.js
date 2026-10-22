/**
 * ==============================================================================
 * EQWEL 会場図面 & ENG視界シミュレーター Mark2
 * 【基盤】コアエンジン (core_engine.js)
 * 
 * 修正内容:
 * 1. 【パレット消失完全根絶】PointerCapture API を採用し、ドラッグ終了時の遮断バグ・
 *    ワープ・クリック誤爆を根本解消
 * 2. 【全12ノート完全対応】客席(tab6_seats.js)を含む全モジュールの描画・操作フック維持
 * 3. 【初期描画バグ解消】起動時の同期レンダリング保証（真っ白画面防止）
 * ==============================================================================
 */

window.coreLog = function(msg, type = 'info') {
  if (window.debugBox && typeof window.debugBox[type] === 'function') {
    window.debugBox[type](msg);
  } else {
    console.log(`[CORE-${type.toUpperCase()}]`, msg);
  }
};

if (!window.core) window.core = {};

// 現在の全12モジュールの集計サマリー
window.core.getSystemSummary = function() {
  try {
    const roomW = (window.room && window.room.w) ? window.room.w : '--';
    const roomD = (window.room && window.room.d) ? window.room.d : '--';
    const stW = (window.stage && window.stage.w) ? window.stage.w : '--';
    const stD = (window.stage && window.stage.d) ? window.stage.d : '--';
    const stH = (window.stage && window.stage.h) ? window.stage.h : '--';
    
    let guestCnt = 0;
    if (window.tabGuestsModule && typeof window.tabGuestsModule.exportData === 'function') {
      const gData = window.tabGuestsModule.exportData();
      guestCnt = Array.isArray(gData) ? gData.length : (gData.list ? gData.list.length : 0);
    }
    
    let seatCnt = window.seats ? window.seats.length : 0;

    let monCnt = 0;
    if (window.tabMonitorModule && typeof window.tabMonitorModule.exportData === 'function') {
      const mData = window.tabMonitorModule.exportData();
      monCnt = Array.isArray(mData) ? mData.length : (mData.list ? mData.list.length : 0);
    }

    let camCnt = 0;
    let camDetails = '';
    if (window.tabCameraModule && typeof window.tabCameraModule.exportData === 'function') {
      const cams = window.tabCameraModule.exportData();
      const cList = Array.isArray(cams) ? cams : (cams.list || []);
      camCnt = cList.length;
      if (camCnt > 0) {
        camDetails = cList.map((c, i) => `CAM${i+1}: ${c.model || 'std'} (FOV ${c.fov}°)`).join(', ');
      }
    }

    return {
      roomInfo: `会場: ${roomW}×${roomD}mm / ステージ: W${stW}×D${stD}×H${stH}mm`,
      stats: `登壇者:${guestCnt}人, 客席:${seatCnt}席, モニター:${monCnt}台, カメラ:${camCnt}台`,
      cameraDetails: camDetails,
      viewMode: window.viewMode || 'top'
    };
  } catch (err) {
    return { roomInfo: '取得エラー', stats: err.message, cameraDetails: '', viewMode: '-' };
  }
};

window.simData = window.simData || {};
window.room = window.room || { w: 14000, d: 26000, shapeType: 'rect', points: [{x:0,y:0},{x:14000,y:0},{x:14000,y:26000},{x:0,y:26000}] };
window.stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
window.isStageLocked = (typeof window.isStageLocked !== 'undefined') ? window.isStageLocked : true;

window.displaySettings = window.displaySettings || {
  showRoomDims: true, showStageDims: true, showGrid: true, showFov: true, gridPitch: 1000
};

let canvas = null;
let ctx = null;
let isRenderPending = false;

window.viewMode = 'top'; 
let zoomLevel = 1.0; 
const BASE_SCALE_TOP = 0.050; 
const BASE_SCALE_SIDE = 0.085; 
window.scale = BASE_SCALE_TOP * zoomLevel;

window.panX = 100;
window.panY = 100;

window.seats = window.seats || [];
window.selectedSeat = null;
window.selectedItems = [];
window.seatTool = window.seatTool || 'select';

let dragTarget = null;
let isBoxSelecting = false;
let boxSelectStart = { x: 0, y: 0 };
let boxSelectEnd = { x: 0, y: 0 };
window.sideScrollOffset = 0; 
window.SIDE_FLOOR_OFFSET_Y = 8000; 

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 40;
let isHistoryRestoring = false;

const ALL_MODULE_KEYS = [
  'tabRoomModule', 'tabFacilityModule', 'tabPodiumModule', 'tabGuestsModule',
  'tabStageItemsModule', 'tabSeatsModule', 'tabCameraModule', 'tabDisplayModule',
  'tabEquipmentModule', 'tabMonitorModule', 'tabBgimageModule', 'tabAiGenModule'
];

window.saveHistory = function saveHistory() {
  if (isHistoryRestoring) return;
  const snapshot = getCurrentStateSnapshot();
  const snapshotStr = JSON.stringify(snapshot);
  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshotStr) return;
  undoStack.push(snapshotStr);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
};

function getCurrentStateSnapshot() {
  const state = {
    room: window.room, stage: window.stage, isStageLocked: window.isStageLocked,
    displaySettings: window.displaySettings, sideScrollOffset: window.sideScrollOffset,
    seats: window.seats,
    modules: {}
  };
  ALL_MODULE_KEYS.forEach(mKey => {
    if (window[mKey] && typeof window[mKey].exportData === 'function') {
      try { state.modules[mKey] = window[mKey].exportData(); } catch (e) {}
    }
  });
  return state;
}

window.undo = function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(JSON.stringify(getCurrentStateSnapshot()));
  applyStateSnapshot(JSON.parse(undoStack.pop()));
  updateHistoryButtons();
};

window.redo = function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(JSON.stringify(getCurrentStateSnapshot()));
  applyStateSnapshot(JSON.parse(redoStack.pop()));
  updateHistoryButtons();
};

function applyStateSnapshot(data) {
  if (!data) return;
  isHistoryRestoring = true;
  try {
    if (data.room) window.room = data.room;
    if (data.stage) window.stage = data.stage;
    if (typeof data.isStageLocked !== 'undefined') window.isStageLocked = data.isStageLocked;
    if (data.displaySettings) window.displaySettings = data.displaySettings;
    if (typeof data.sideScrollOffset !== 'undefined') window.sideScrollOffset = data.sideScrollOffset;
    if (data.seats) window.seats = data.seats;

    if (data.modules) {
      ALL_MODULE_KEYS.forEach(mKey => {
        if (data.modules[mKey] && window[mKey] && typeof window[mKey].importData === 'function') {
          try { window[mKey].importData(data.modules[mKey]); } catch (e) {}
        }
      });
    }
    syncCoreInputs();
    updateStats();
    if (window.updateSeatCountBadge) window.updateSeatCountBadge();
    window.updateCanvasSize();
    window.requestRender();
  } finally {
    isHistoryRestoring = false;
  }
}

function updateHistoryButtons() {
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  if (btnUndo) btnUndo.disabled = (undoStack.length === 0);
  if (btnRedo) btnRedo.disabled = (redoStack.length === 0);
}

window.requestRender = function requestRender() {
  if (!isRenderPending) {
    isRenderPending = true;
    requestAnimationFrame(() => {
      try { window.render(); } catch (err) { console.error(err); } finally { isRenderPending = false; }
    });
  }
};

window.updateCanvasSize = function updateCanvasSize() {
  if (!canvas) return;
  window.scale = (window.viewMode === 'top' ? BASE_SCALE_TOP : BASE_SCALE_SIDE) * zoomLevel;
  if (window.viewMode === 'top') {
    canvas.width = Math.round(window.room.w * window.scale + window.panX * 2);
    canvas.height = Math.round(window.room.d * window.scale + window.panY * 2);
  } else {
    canvas.width = Math.round(window.room.d * window.scale + window.panX * 2);
    canvas.height = Math.max(900, Math.round((window.SIDE_FLOOR_OFFSET_Y + 2500) * window.scale + window.panY * 2));
  }
  const badge = document.getElementById('zoomBadge');
  if (badge) badge.innerText = `${Math.round(zoomLevel * 100)}%`;
};

window.render = function render() {
  if (!canvas) canvas = document.getElementById('simCanvas');
  if (!canvas) return;
  if (!ctx) ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(window.panX, window.panY);
  ctx.scale(window.scale, window.scale);

  if (window.viewMode === 'top') renderTopPlanTo(ctx);
  else renderSidePlanTo(ctx);

  ctx.restore();

  if (isBoxSelecting && window.viewMode === 'top') renderSelectionBox(ctx);
  updateStats();
};

function renderTopPlanTo(tCtx) {
  if (window.tabBgimageModule && typeof window.tabBgimageModule.drawTop === 'function') window.tabBgimageModule.drawTop(tCtx);
  if (window.displaySettings.showGrid) drawGrid(tCtx);

  tCtx.save();
  tCtx.strokeStyle = '#94a3b8'; tCtx.lineWidth = 30; tCtx.setLineDash([200, 100]);
  tCtx.beginPath(); tCtx.moveTo(window.room.w / 2, 0); tCtx.lineTo(window.room.w / 2, window.room.d); tCtx.stroke();
  tCtx.restore();

  if (window.tabRoomModule && typeof window.tabRoomModule.drawTop === 'function') {
    window.tabRoomModule.drawTop(tCtx);
  } else {
    tCtx.strokeStyle = '#000000'; tCtx.lineWidth = 70; tCtx.strokeRect(0, 0, window.room.w, window.room.d);
    if (window.displaySettings.showRoomDims) {
      drawDimLine(tCtx, 0, 0, window.room.w, 0, `会場全幅 W: ${window.room.w}`, -450, false);
      drawDimLine(tCtx, 0, 0, 0, window.room.d, `会場奥行 D: ${window.room.d}`, -450, true);
    }
  }

  if (window.tabFacilityModule && typeof window.tabFacilityModule.drawTop === 'function') {
    window.tabFacilityModule.drawTop(tCtx);
  } else {
    tCtx.save();
    tCtx.strokeStyle = window.isStageLocked ? '#000000' : '#2563eb';
    tCtx.lineWidth = 60; tCtx.fillStyle = '#f8fafc';
    tCtx.fillRect(window.stage.x, window.stage.y, window.stage.w, window.stage.d);
    tCtx.strokeRect(window.stage.x, window.stage.y, window.stage.w, window.stage.d);
    tCtx.fillStyle = 'rgba(15, 23, 42, 0.08)'; tCtx.font = '900 450px sans-serif';
    tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
    tCtx.fillText('STAGE', window.stage.x + window.stage.w / 2, window.stage.y + window.stage.d / 2);
    tCtx.restore();
  }

  if (window.tabPodiumModule && typeof window.tabPodiumModule.drawTop === 'function') window.tabPodiumModule.drawTop(tCtx);
  if (window.tabGuestsModule && typeof window.tabGuestsModule.drawTop === 'function') window.tabGuestsModule.drawTop(tCtx);
  if (window.tabStageItemsModule && typeof window.tabStageItemsModule.drawTop === 'function') window.tabStageItemsModule.drawTop(tCtx);
  if (window.tabEquipmentModule && typeof window.tabEquipmentModule.drawTop === 'function') window.tabEquipmentModule.drawTop(tCtx);
  if (window.tabMonitorModule && typeof window.tabMonitorModule.drawTop === 'function') window.tabMonitorModule.drawTop(tCtx);
  if (window.tabCameraModule && typeof window.tabCameraModule.drawTop === 'function') window.tabCameraModule.drawTop(tCtx);
  if (window.tabDisplayModule && typeof window.tabDisplayModule.drawTop === 'function') window.tabDisplayModule.drawTop(tCtx);
  if (window.tabAiGenModule && typeof window.tabAiGenModule.drawTop === 'function') window.tabAiGenModule.drawTop(tCtx);
}

function renderSidePlanTo(tCtx) {
  tCtx.save();
  tCtx.translate(-window.sideScrollOffset, window.SIDE_FLOOR_OFFSET_Y); 

  tCtx.strokeStyle = '#f1f5f9'; tCtx.lineWidth = 20;
  for (let y = 0; y <= window.room.d; y += 2000) { tCtx.beginPath(); tCtx.moveTo(y, 1000); tCtx.lineTo(y, -6000); tCtx.stroke(); }
  for (let z = 0; z <= 6000; z += 1000) { tCtx.beginPath(); tCtx.moveTo(0, -z); tCtx.lineTo(window.room.d, -z); tCtx.stroke(); }

  tCtx.beginPath(); tCtx.moveTo(-1000, 0); tCtx.lineTo(window.room.d + 1000, 0);
  tCtx.strokeStyle = '#94a3b8'; tCtx.lineWidth = 4; tCtx.stroke();

  if (window.tabFacilityModule && typeof window.tabFacilityModule.drawSide === 'function') {
    window.tabFacilityModule.drawSide(tCtx);
  } else {
    tCtx.save();
    tCtx.fillStyle = '#f8fafc'; tCtx.strokeStyle = '#0f172a'; tCtx.lineWidth = 24;
    tCtx.fillRect(window.stage.y, -window.stage.h, window.stage.d, window.stage.h);
    tCtx.strokeRect(window.stage.y, -window.stage.h, window.stage.d, window.stage.h);
    tCtx.restore();
  }

  if (window.tabRoomModule && typeof window.tabRoomModule.drawSide === 'function') window.tabRoomModule.drawSide(tCtx);
  if (window.tabPodiumModule && typeof window.tabPodiumModule.drawSide === 'function') window.tabPodiumModule.drawSide(tCtx);
  if (window.tabGuestsModule && typeof window.tabGuestsModule.drawSide === 'function') window.tabGuestsModule.drawSide(tCtx);
  if (window.tabStageItemsModule && typeof window.tabStageItemsModule.drawSide === 'function') window.tabStageItemsModule.drawSide(tCtx);
  if (window.tabMonitorModule && typeof window.tabMonitorModule.drawSide === 'function') window.tabMonitorModule.drawSide(tCtx);
  if (window.tabEquipmentModule && typeof window.tabEquipmentModule.drawSide === 'function') window.tabEquipmentModule.drawSide(tCtx);

  if (window.tabCameraModule) {
    if (typeof window.tabCameraModule.drawCameraSide === 'function') window.tabCameraModule.drawCameraSide(tCtx);
    else if (typeof window.tabCameraModule.drawSide === 'function') window.tabCameraModule.drawSide(tCtx);
  }

  if (window.tabDisplayModule && typeof window.tabDisplayModule.drawSide === 'function') window.tabDisplayModule.drawSide(tCtx);
  if (window.tabAiGenModule && typeof window.tabAiGenModule.drawSide === 'function') window.tabAiGenModule.drawSide(tCtx);

  tCtx.restore();
}

function drawGrid(tCtx) {
  tCtx.save();
  tCtx.strokeStyle = '#f1f5f9'; tCtx.lineWidth = 15;
  for (let x = 0; x <= window.room.w; x += 1000) { tCtx.beginPath(); tCtx.moveTo(x, 0); tCtx.lineTo(x, window.room.d); tCtx.stroke(); }
  for (let y = 0; y <= window.room.d; y += 1000) { tCtx.beginPath(); tCtx.moveTo(0, y); tCtx.lineTo(window.room.w, y); tCtx.stroke(); }
  tCtx.strokeStyle = '#e2e8f0'; tCtx.lineWidth = 30;
  for (let x = 0; x <= window.room.w; x += 5000) { tCtx.beginPath(); tCtx.moveTo(x, 0); tCtx.lineTo(x, window.room.d); tCtx.stroke(); }
  for (let y = 0; y <= window.room.d; y += 5000) { tCtx.beginPath(); tCtx.moveTo(0, y); tCtx.lineTo(window.room.w, y); tCtx.stroke(); }
  tCtx.restore();
}

function drawDimLine(tCtx, x1, y1, x2, y2, text, offset = 0, isVertical = false) {
  tCtx.save();
  tCtx.strokeStyle = '#0f172a'; tCtx.fillStyle = '#0f172a'; tCtx.lineWidth = 15;
  tCtx.font = 'bold 200px sans-serif'; tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
  const tick = 80;
  if (!isVertical) {
    const lineY = y1 + offset;
    tCtx.beginPath(); tCtx.moveTo(x1, lineY); tCtx.lineTo(x2, lineY);
    tCtx.moveTo(x1, lineY - tick); tCtx.lineTo(x1, lineY + tick);
    tCtx.moveTo(x2, lineY - tick); tCtx.lineTo(x2, lineY + tick);
    if (Math.abs(offset) > 100) { tCtx.strokeStyle = '#94a3b8'; tCtx.lineWidth = 10; tCtx.moveTo(x1, y1); tCtx.lineTo(x1, lineY); tCtx.moveTo(x2, y2); tCtx.lineTo(x2, lineY); }
    tCtx.stroke(); tCtx.fillText(text, (x1 + x2) / 2, lineY - 140);
  } else {
    const lineX = x1 + offset;
    tCtx.beginPath(); tCtx.moveTo(lineX, y1); tCtx.lineTo(lineX, y2);
    tCtx.moveTo(lineX - tick, y1); tCtx.lineTo(lineX + tick, y1);
    tCtx.moveTo(lineX - tick, y2); tCtx.lineTo(lineX + tick, y2);
    if (Math.abs(offset) > 100) { tCtx.strokeStyle = '#94a3b8'; tCtx.lineWidth = 10; tCtx.moveTo(x1, y1); tCtx.lineTo(lineX, y1); tCtx.moveTo(x2, y2); tCtx.lineTo(lineX, y2); }
    tCtx.stroke(); tCtx.save(); tCtx.translate(lineX - 140, (y1 + y2) / 2); tCtx.rotate(-Math.PI / 2); tCtx.fillText(text, 0, 0); tCtx.restore();
  }
  tCtx.restore();
}

function renderSelectionBox(targetCtx) {
  const left = Math.min(boxSelectStart.x, boxSelectEnd.x);
  const top = Math.min(boxSelectStart.y, boxSelectEnd.y);
  const width = Math.abs(boxSelectEnd.x - boxSelectStart.x);
  const height = Math.abs(boxSelectEnd.y - boxSelectStart.y);
  targetCtx.save();
  targetCtx.strokeStyle = '#2563eb'; targetCtx.lineWidth = 1.5; targetCtx.setLineDash([4, 4]);
  targetCtx.fillStyle = 'rgba(37, 99, 235, 0.12)'; targetCtx.fillRect(left, top, width, height); targetCtx.strokeRect(left, top, width, height);
  targetCtx.restore();
}

function setupCanvasEvents() {
  if (!canvas) return;

  canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    let wx = (mx - window.panX) / window.scale;
    let wy = (my - window.panY) / window.scale;

    if (window.viewMode === 'side') {
      wx += window.sideScrollOffset;
      wy -= window.SIDE_FLOOR_OFFSET_Y;
    }

    // 客席の操作判定 (tab6_seats.js が持つ window.seats を判定)
    if (window.viewMode === 'top' && window.seats) {
      if (window.seatTool === 'add') {
        window.saveHistory();
        window.seats.push({ id: `S-${Date.now()}`, x: Math.round(wx), y: Math.round(wy), angle: 0 });
        if (window.updateSeatCountBadge) window.updateSeatCountBadge();
        window.requestRender();
        return;
      }
      
      let clickedSeat = null;
      const hitRadius = (window.chair && window.chair.w) ? window.chair.w / 2 : 250;
      for (let i = window.seats.length - 1; i >= 0; i--) {
        const s = window.seats[i];
        if (Math.hypot(s.x - wx, s.y - wy) < hitRadius) {
          clickedSeat = s;
          break;
        }
      }

      if (clickedSeat) {
        if (window.seatTool === 'delete') {
          window.saveHistory();
          window.seats = window.seats.filter(s => s.id !== clickedSeat.id);
          if (window.selectedSeat && window.selectedSeat.id === clickedSeat.id) window.selectedSeat = null;
          if (window.updateSeatCountBadge) window.updateSeatCountBadge();
          if (window.updateSeatAngleUI) window.updateSeatAngleUI();
          window.requestRender();
          return;
        }

        if (window.seatTool === 'select' || window.seatTool === 'move') {
          const isGroupSelected = window.selectedItems.some(i => i.type === 'seat' && i.id === clickedSeat.id);
          
          if (!isGroupSelected) {
            if (!e.shiftKey) window.selectedItems = [];
            window.selectedSeat = clickedSeat;
            window.selectedItems.push({ type: 'seat', id: clickedSeat.id });
          }
          
          if (window.updateSeatAngleUI) window.updateSeatAngleUI();
          window.switchTab('seats');

          if (window.seatTool === 'move') {
            dragTarget = { type: 'seat_group', offsetX: wx, offsetY: wy };
            window.selectedItems.forEach(item => {
              if (item.type === 'seat') {
                const s = window.seats.find(st => st.id === item.id);
                if (s) { item.startX = s.x; item.startY = s.y; }
              }
            });
          }
          window.requestRender();
          return;
        }
      } else {
        if (window.seatTool === 'select' && !e.shiftKey) {
          window.selectedSeat = null;
          window.selectedItems = [];
          if (window.updateSeatAngleUI) window.updateSeatAngleUI();
        }
      }
    }

    const hitCheckOrder = [
      'tabCameraModule', 'tabMonitorModule',
      'tabGuestsModule', 'tabStageItemsModule', 'tabPodiumModule',
      'tabEquipmentModule', 'tabFacilityModule', 'tabRoomModule',
      'tabBgimageModule', 'tabDisplayModule', 'tabAiGenModule'
    ];

    for (const mKey of hitCheckOrder) {
      if (window[mKey] && typeof window[mKey].hitTest === 'function') {
        const target = window[mKey].hitTest(wx, wy);
        if (target) {
          dragTarget = { ...target, module: window[mKey] };
          window.requestRender();
          return;
        }
      }
    }

    if (!window.isStageLocked && window.viewMode === 'top' &&
        wx >= window.stage.x && wx <= window.stage.x + window.stage.w &&
        wy >= window.stage.y && wy <= window.stage.y + window.stage.d) {
      dragTarget = { type: 'stage', offsetX: wx - window.stage.x, offsetY: wy - window.stage.y };
      window.switchTab('facility');
      return;
    }

    if (window.viewMode === 'top' && window.seatTool === 'select') {
      isBoxSelecting = true;
      boxSelectStart = { x: mx, y: my };
      boxSelectEnd = { x: mx, y: my };
      if (!e.shiftKey) {
        window.selectedItems = [];
        window.selectedSeat = null;
        if (window.updateSeatAngleUI) window.updateSeatAngleUI();
      }
      return;
    }
  });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    let wx = (mx - window.panX) / window.scale;
    let wy = (my - window.panY) / window.scale;

    if (window.viewMode === 'side') {
      wx += window.sideScrollOffset;
      wy -= window.SIDE_FLOOR_OFFSET_Y;
    }

    if (dragTarget) {
      if (dragTarget.type === 'seat_group') {
        const dx = wx - dragTarget.offsetX;
        const dy = wy - dragTarget.offsetY;
        window.selectedItems.forEach(item => {
          if (item.type === 'seat') {
            const s = window.seats.find(st => st.id === item.id);
            if (s) {
              s.x = Math.round(item.startX + dx);
              s.y = Math.round(item.startY + dy);
            }
          }
        });
        window.requestRender();
        return;
      }

      if (dragTarget.module && typeof dragTarget.module.handleDrag === 'function') {
        dragTarget.module.handleDrag(dragTarget, wx, wy);
        window.requestRender();
        return;
      }
      if (dragTarget.type === 'stage' && !window.isStageLocked && window.viewMode === 'top') {
        window.stage.x = Math.round(wx - dragTarget.offsetX);
        window.stage.y = Math.round(wy - dragTarget.offsetY);
        syncCoreInputs();
        window.requestRender();
        return;
      }
    }

    if (isBoxSelecting) {
      boxSelectEnd = { x: mx, y: my };
      window.requestRender();
      return;
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragTarget) { window.saveHistory(); dragTarget = null; }
    if (isBoxSelecting) {
      isBoxSelecting = false;
      const wx1 = (Math.min(boxSelectStart.x, boxSelectEnd.x) - window.panX) / window.scale;
      const wy1 = (Math.min(boxSelectStart.y, boxSelectEnd.y) - window.panY) / window.scale;
      const wx2 = (Math.max(boxSelectStart.x, boxSelectEnd.x) - window.panX) / window.scale;
      const wy2 = (Math.max(boxSelectStart.y, boxSelectEnd.y) - window.panY) / window.scale;
      
      if (window.seats) {
        window.seats.forEach(s => {
          if (s.x >= wx1 && s.x <= wx2 && s.y >= wy1 && s.y <= wy2) {
            if (!window.selectedItems.some(i => i.type === 'seat' && i.id === s.id)) {
              window.selectedItems.push({ type: 'seat', id: s.id });
              window.selectedSeat = s;
            }
          }
        });
        if (window.updateSeatAngleUI) window.updateSeatAngleUI();
      }
      window.requestRender();
    }
  });
}

function setupKeyShortcuts() {
  window.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); window.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); window.redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); openSaveModal(); return; }
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (window.selectedItems && window.selectedItems.length > 0) {
        window.saveHistory();
        window.selectedItems.forEach(item => {
          if (item.type === 'seat') {
            window.seats = window.seats.filter(s => s.id !== item.id);
          }
        });
        window.selectedItems = [];
        window.selectedSeat = null;
        if (window.updateSeatCountBadge) window.updateSeatCountBadge();
        if (window.updateSeatAngleUI) window.updateSeatAngleUI();
        window.requestRender();
      }
    }
  });
}

window.setViewMode = function setViewMode(mode) {
  window.viewMode = mode;
  document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
  const targetBtn = document.getElementById(`btn-${mode}`);
  if (targetBtn) targetBtn.classList.add('active');
  const sliceBar = document.getElementById('side-scrollbar-container');
  if (sliceBar) sliceBar.style.display = (mode === 'side') ? 'flex' : 'none';
  const badge = document.getElementById('viewModeBadge');
  if (badge) badge.innerText = (mode === 'top') ? '🗺️ 平面図' : '📐 立面図';
  window.updateCanvasSize();
  window.requestRender();
};

function adjustZoom(factor) {
  zoomLevel = Math.max(0.3, Math.min(3.0, zoomLevel * factor));
  window.updateCanvasSize();
  window.requestRender();
}

function setZoom100() {
  zoomLevel = 1.0;
  window.updateCanvasSize();
  const container = document.getElementById('main-container');
  if (container && canvas) {
    container.scrollLeft = Math.max(0, (canvas.offsetWidth - container.clientWidth) / 2);
    container.scrollTop = 0;
  }
  window.requestRender();
}

function fitView() {
  const container = document.getElementById('main-container');
  if (!container) return;
  const availW = container.clientWidth - 120;
  const availH = container.clientHeight - 120;
  if (window.viewMode === 'top') {
    const fitScaleX = availW / window.room.w;
    const fitScaleY = availH / window.room.d;
    zoomLevel = (Math.min(fitScaleX, fitScaleY) * 0.96) / BASE_SCALE_TOP;
  } else {
    zoomLevel = (availW / window.room.d * 0.96) / BASE_SCALE_SIDE;
  }
  zoomLevel = Math.max(0.3, Math.min(2.5, zoomLevel));
  window.updateCanvasSize();
  if (container && canvas) {
    container.scrollLeft = Math.max(0, (canvas.offsetWidth - container.clientWidth) / 2);
    container.scrollTop = 0;
  }
  window.requestRender();
}

window.onSideScrollChange = function(val) {
  const numVal = parseFloat(val) || 0;
  window.sideScrollOffset = numVal;
  const disp = document.getElementById('sideScrollValDisplay');
  if (disp) disp.innerText = `${(numVal / 1000).toFixed(1)}m`;
  window.requestRender();
};

window.stepSideScroll = function(delta) {
  const range = document.getElementById('side-scroll-range');
  if (!range) return;
  let val = parseFloat(range.value) + delta;
  val = Math.max(0, Math.min(window.room.d, val));
  range.value = val;
  window.onSideScrollChange(val);
};

function toggleFov() {
  window.displaySettings.showFov = !window.displaySettings.showFov;
  const btn = document.getElementById('btn-fov');
  if (btn) btn.innerText = window.displaySettings.showFov ? '👁️ 視野角: ON' : '👁️ 視野角: OFF';
  window.requestRender();
}

// ==============================================================================
// 6. フローティングパレット制御（PointerCapture APIによる堅牢なドラッグ機構）
// ==============================================================================
function setupFloatingUI() {
  const floatUi = document.getElementById('floating-ui');
  const floatHeader = document.getElementById('floating-header');
  if (!floatUi || !floatHeader) return;

  // 1. 強制的に body 直下へ移動（親コンテナスクロールの巻き添えを完全遮断）
  if (floatUi.parentElement !== document.body) {
    document.body.appendChild(floatUi);
  }

  // スタイルを fixed かつ高 z-index に強制
  floatUi.style.position = 'fixed';
  floatUi.style.zIndex = '999999';

  // 2. パレット内部のクリックやホイールが背面のキャンバスへ抜けるのをブロック
  const stopEvts = ['mousedown', 'click', 'dblclick', 'wheel'];
  stopEvts.forEach(evt => {
    floatUi.addEventListener(evt, e => e.stopPropagation(), { passive: evt === 'wheel' ? false : true });
  });

  // 3. Pointer Events による安定したドラッグ処理
  let isDragging = false;
  let hasMoved = false;
  let offsetX = 0;
  let offsetY = 0;

  floatHeader.addEventListener('pointerdown', e => {
    // 最小化ボタンや入力欄をクリックした時はドラッグを開始しない
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.target.closest('button') || e.target.id === 'palette-arrow') return;

    isDragging = true;
    hasMoved = false;

    // ポインタのキャプチャ（マウスが高速でヘッダー外に出ても追跡を失わない）
    try { floatHeader.setPointerCapture(e.pointerId); } catch (_) {}

    const rect = floatUi.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    floatUi.style.right = 'auto';
    floatUi.style.bottom = 'auto';
    floatUi.style.left = rect.left + 'px';
    floatUi.style.top = rect.top + 'px';
    floatUi.style.margin = '0';
    floatUi.style.transition = 'none';

    document.body.style.userSelect = 'none';
  });

  floatHeader.addEventListener('pointermove', e => {
    if (!isDragging) return;

    const dx = Math.abs(e.clientX - (parseFloat(floatUi.style.left) + offsetX));
    const dy = Math.abs(e.clientY - (parseFloat(floatUi.style.top) + offsetY));
    if (dx > 3 || dy > 3) hasMoved = true;

    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;

    const maxLeft = Math.max(0, window.innerWidth - floatUi.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - 40);
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    floatUi.style.left = newLeft + 'px';
    floatUi.style.top = newTop + 'px';
  });

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { floatHeader.releasePointerCapture(e.pointerId); } catch (_) {}
    document.body.style.userSelect = 'auto';
    floatUi.style.transition = 'opacity 0.2s ease';

    // ドラッグ移動が発生していた場合は、直後の click による最小化・トグルの誤爆を握り潰す
    if (hasMoved) {
      const suppressClick = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', suppressClick, true);
      };
      window.addEventListener('click', suppressClick, true);
    }
  };

  floatHeader.addEventListener('pointerup', endDrag);
  floatHeader.addEventListener('pointercancel', endDrag);
}

function togglePalette() {
  const el = document.getElementById('floating-ui');
  if (!el) return;
  const isHidden = (el.style.display === 'none' || getComputedStyle(el).display === 'none');
  if (isHidden) {
    el.style.display = 'flex';
    el.style.position = 'fixed';
    const rect = el.getBoundingClientRect();
    if (rect.left < 0 || rect.left > window.innerWidth - 80 || rect.top < 0 || rect.top > window.innerHeight - 80) {
      el.style.top = '110px'; el.style.left = 'auto'; el.style.right = '14px';
    }
  } else {
    el.style.display = 'none';
  }
}

let isUiCollapsed = false;
function toggleFloatingUi() {
  const body = document.getElementById('floating-body');
  const arrow = document.getElementById('palette-arrow');
  const btn = document.getElementById('btn-collapse');
  if (!body) return;
  isUiCollapsed = !isUiCollapsed;
  body.style.display = isUiCollapsed ? 'none' : 'flex';
  if (arrow) arrow.innerText = isUiCollapsed ? '▲' : '▼';
  if (btn) btn.innerText = isUiCollapsed ? '＋' : '－';
}

window.switchTab = function switchTab(tabKey) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  const activeBtn = document.getElementById(`tabbtn-${tabKey}`);
  const activePanel = document.getElementById(`panel-${tabKey}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');
  if (isUiCollapsed) toggleFloatingUi();
};

function syncCoreInputs() {
  const roomWInput = document.getElementById('roomW');
  const roomDInput = document.getElementById('roomD');
  if (roomWInput) roomWInput.value = window.room.w;
  if (roomDInput) roomDInput.value = window.room.d;
  const stageWInput = document.getElementById('stageW');
  const stageDInput = document.getElementById('stageD');
  const stageHInput = document.getElementById('stageH');
  const stageLock = document.getElementById('stageLockCheck');
  if (stageWInput) stageWInput.value = window.stage.w;
  if (stageDInput) stageDInput.value = window.stage.d;
  if (stageHInput) stageHInput.value = window.stage.h;
  if (stageLock) stageLock.checked = window.isStageLocked;
}

function updateStats() {
  const statRoom = document.getElementById('statRoom');
  const statStage = document.getElementById('statStage');
  const statSeats = document.getElementById('statSeats');
  if (statRoom) statRoom.innerText = `${(window.room.w / 1000).toFixed(1)}m × ${(window.room.d / 1000).toFixed(1)}m`;
  if (statStage) statStage.innerText = `W:${(window.stage.w / 1000).toFixed(1)}m D:${(window.stage.d / 1000).toFixed(1)}m (H:${window.stage.h}mm)`;
  
  if (statSeats) statSeats.innerText = `${window.seats ? window.seats.length : 0}席`;
  const statClear = document.getElementById('statClear');
  const statPartial = document.getElementById('statPartial');
  if (statClear) statClear.innerText = `0 席`;
  if (statPartial) statPartial.innerText = `0 席`;
}

function exportCanvasImage() {
  const expCanvas = document.createElement('canvas');
  const expW = 2400; const expH = 1350;
  expCanvas.width = expW; expCanvas.height = expH;
  const expCtx = expCanvas.getContext('2d');
  expCtx.fillStyle = '#ffffff'; expCtx.fillRect(0, 0, expW, expH);
  expCtx.save();
  if (window.viewMode === 'top') {
    const fitScaleX = (expW - 200) / window.room.w;
    const fitScaleY = (expH - 260) / window.room.d;
    const expScale = Math.min(fitScaleX, fitScaleY);
    expCtx.translate((expW - window.room.w * expScale) / 2, 130);
    expCtx.scale(expScale, expScale);
    renderTopPlanTo(expCtx);
    if (window.tabSeatsModule && window.tabSeatsModule.renderSeats) window.tabSeatsModule.renderSeats(expCtx);
  } else {
    const expScale = (expW - 240) / window.room.d;
    expCtx.translate(120, expH * 0.62);
    expCtx.scale(expScale, expScale);
    renderSidePlanTo(expCtx);
  }
  expCtx.restore();
  expCtx.fillStyle = '#0f172a'; expCtx.font = 'bold 32px sans-serif';
  expCtx.fillText(`会場図面シミュレーター 【${window.viewMode === 'top' ? '平面図 (俯瞰レイアウト)' : '立面図 (ENG視界断面)'}】`, 50, 50);
  expCtx.font = '16px sans-serif'; expCtx.fillStyle = '#64748b';
  expCtx.fillText(`会場外郭: ${window.room.w}×${window.room.d}mm | ステージ: ${window.stage.w}×${window.stage.d}mm (H:${window.stage.h}mm)`, 50, 85);
  const link = document.createElement('a');
  link.download = `StagePlan_${window.viewMode === 'top' ? 'Top' : 'Side'}_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = expCanvas.toDataURL('image/png');
  link.click();
}

function openSaveModal() { const m = document.getElementById('saveModal'); if (m) m.style.display = 'flex'; }
function closeSaveModal() { const m = document.getElementById('saveModal'); if (m) m.style.display = 'none'; }
function confirmSaveJson() {
  const fnInput = document.getElementById('modalFileName');
  let fn = fnInput ? fnInput.value : 'Venue_Layout_Mark2.json';
  if (!fn.endsWith('.json')) fn += '.json';
  const blob = new Blob([JSON.stringify(getCurrentStateSnapshot(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; a.click();
  closeSaveModal();
}
function importJson(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try { applyStateSnapshot(JSON.parse(ev.target.result)); window.saveHistory(); } catch (err) { alert('読込失敗'); }
  };
  reader.readAsText(file);
}

// ==============================================================================
// 9. エンジン初期化エントリポイント
// ==============================================================================
function initCoreEngine() {
  canvas = document.getElementById('simCanvas');
  if (canvas) ctx = canvas.getContext('2d');

  setupFloatingUI();
  setupCanvasEvents();
  setupKeyShortcuts();

  const roomWInput = document.getElementById('roomW');
  const roomDInput = document.getElementById('roomD');
  if (roomWInput) roomWInput.addEventListener('change', () => { window.room.w = parseFloat(roomWInput.value) || 14000; window.updateCanvasSize(); window.requestRender(); window.saveHistory(); });
  if (roomDInput) roomDInput.addEventListener('change', () => { window.room.d = parseFloat(roomDInput.value) || 26000; window.updateCanvasSize(); window.requestRender(); window.saveHistory(); });

  const sideScrollRange = document.getElementById('side-scroll-range');
  if (sideScrollRange) sideScrollRange.addEventListener('input', e => window.onSideScrollChange(e.target.value));

  syncCoreInputs();
  window.updateCanvasSize();
  window.render();
  setZoom100();
  window.saveHistory();
  window.coreLog('コアエンジンが正常にロードされました', 'info');
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initCoreEngine);
} else {
  initCoreEngine();
}