/**
 * tab6_seats.js
 * タブ6：客席配置・個別編集・角度調整 & 立面図描画モジュール
 * ・カメラ未選択時でも確実に立面図を描画するフォールバック対応
 * ・コアエンジンの hitTest / handleDrag による1席単位の操作対応
 * ・Z=0 (FL±0) を基準とした正確な立面図の接地描画
 */

(function () {
  'use strict';

  // ==========================================
  // グローバルデータ共有
  // ==========================================
  window.seats = window.seats || [];
  window.chair = window.chair || { w: 480, d: 480, h: 450, backH: 400 };
  window.seatedTorsoH = window.seatedTorsoH || 820; // デフォルト 450 + 820 = 1270
  window.totalHeadZ = window.totalHeadZ || 1270;
  window.seatTool = window.seatTool || 'select';

  const tabSeatsModule = {
    init: function () {
      this.injectUI();
      this.bindEvents();
    },

    // ==========================================
    // UI自動注入
    // ==========================================
    injectUI: function () {
      const panel = document.getElementById('panel-seats');
      if (!panel) return;

      panel.innerHTML = `
        <div class="ui-group">
          <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span>🛠️ ツールモード</span>
            <span id="seatCountBadge" style="background:#2563eb; color:#fff; padding:2px 8px; border-radius:10px; font-size:11px;">
              ${window.seats.length} 席
            </span>
          </div>
          <div class="ui-row">
            <button class="btn-action active" id="tool-select" data-tool="select" style="flex:1;">👆 選択</button>
            <button class="btn-action" id="tool-move" data-tool="move" style="flex:1;">↔️ ドラッグ</button>
            <button class="btn-action" id="tool-delete" data-tool="delete" style="flex:1;">❌ 1席削除</button>
            <button class="btn-action" id="tool-add" data-tool="add" style="flex:1;">➕ 1席追加</button>
          </div>
        </div>

        <div class="ui-group">
          <div class="ui-group-title">椅子寸法 & 観客の頭頂高 (mm)</div>
          <div class="ui-row">
            <div class="input-box"><label>幅(W)</label><input type="number" id="chairW" value="${window.chair.w}" step="20"></div>
            <div class="input-box"><label>奥行(D)</label><input type="number" id="chairD" value="${window.chair.d}" step="20"></div>
            <div class="input-box"><label>座面高(H)</label><input type="number" id="chairH" value="${window.chair.h}" step="20"></div>
            <div class="input-box"><label>背もたれ高</label><input type="number" id="chairBackH" value="${window.chair.backH}" step="20"></div>
          </div>
          <div class="ui-row" style="margin-top:6px;">
            <div class="input-box">
              <label style="color:#b91c1c; font-weight:bold;">観客の座高</label>
              <input type="number" id="seatedTorsoH" value="${window.seatedTorsoH}" step="10">
            </div>
            <div class="input-box">
              <label style="color:#b91c1c; font-weight:bold;">前席頭頂高(Z)</label>
              <input type="number" id="seatedTotalHeadZ" value="${window.totalHeadZ}" step="10">
            </div>
          </div>
        </div>

        <div class="ui-group">
          <div class="ui-group-title">グリッド整列（自動生成）</div>
          <div class="ui-row">
            <div class="input-box"><label>列数</label><input type="number" id="rows" value="16" min="1" max="60"></div>
            <div class="input-box"><label>列P(Y)</label><input type="number" id="rowPitch" value="950" step="50"></div>
            <div class="input-box"><label>構成</label><input type="text" id="blockCols" value="3,6,3" placeholder="例: 3,6,3"></div>
            <div class="input-box"><label>席P(X)</label><input type="number" id="seatPitch" value="520" step="20"></div>
          </div>
          <div class="ui-row" style="margin-top:6px;">
            <div class="input-box"><label>通路幅</label><input type="number" id="aisleW" value="1000" step="100"></div>
            <div class="input-box"><label>離隔(Y)</label><input type="number" id="stageDist" value="2500" step="100"></div>
            <button class="btn-action" id="btn-rebuild-seats" style="margin-top:auto;">🔄 再配置</button>
          </div>
        </div>

        <div class="ui-group" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px;">
          <div class="ui-group-title" style="color:#0284c7;">
            <span>🪑 選択座席の角度調整 (一括連動)</span>
            <span id="selectedSeatLabel" style="font-size:10px; color:#475569;">席未選択</span>
          </div>
          <div class="input-box" style="margin-top:4px;">
            <div style="display:flex; justify-content:space-between; font-size:10px; color:#64748b;">
              <label>回転角度</label>
              <span id="seatAngleValDisplay" style="font-weight:bold; color:#0f172a;">0°</span>
            </div>
            <input type="range" id="seatAngleSlider" min="-180" max="180" step="5" value="0">
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-top:6px;">
            <button type="button" class="btn-action" style="font-size:10px; padding:4px; background:#f0fdf4; border-color:#16a34a; color:#15803d;" id="btn-align-line">📏 選択席を1直線に整列</button>
            <button type="button" class="btn-action" style="font-size:10px; padding:4px; background:#eff6ff; border-color:#2563eb; color:#1d4ed8;" id="btn-aim-center">🎯 ステージ中央に向ける</button>
          </div>
        </div>
      `;
    },

    // ==========================================
    // イベントバインド
    // ==========================================
    bindEvents: function () {
      const self = this;
      
      const tools = ['select', 'move', 'delete', 'add'];
      tools.forEach(t => {
        const btn = document.getElementById('tool-' + t);
        if (btn) {
          btn.addEventListener('click', () => {
            window.seatTool = t;
            tools.forEach(tx => document.getElementById('tool-' + tx)?.classList.remove('active'));
            btn.classList.add('active');
          });
        }
      });

      ['chairW', 'chairD', 'chairH', 'chairBackH'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', (e) => {
          if (window.saveHistory) window.saveHistory();
          window.chair[id.replace('chair', '').toLowerCase()] = parseFloat(e.target.value) || 480;
          if (id === 'chairH') self.updateHeadZ();
          self.requestGlobalRender();
        });
      });

      const seatedTorsoEl = document.getElementById('seatedTorsoH');
      if (seatedTorsoEl) {
        seatedTorsoEl.addEventListener('change', (e) => {
          if (window.saveHistory) window.saveHistory();
          window.seatedTorsoH = parseFloat(e.target.value) || 820;
          self.updateHeadZ();
        });
      }
      
      const headZEl = document.getElementById('seatedTotalHeadZ');
      if (headZEl) {
        headZEl.addEventListener('change', (e) => {
          if (window.saveHistory) window.saveHistory();
          window.totalHeadZ = parseFloat(e.target.value) || 1270;
          window.seatedTorsoH = Math.max(400, window.totalHeadZ - window.chair.h);
          if (document.getElementById('seatedTorsoH')) {
            document.getElementById('seatedTorsoH').value = Math.round(window.seatedTorsoH);
          }
          self.requestGlobalRender();
        });
      }

      ['rows', 'rowPitch', 'blockCols', 'seatPitch', 'aisleW', 'stageDist'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('change', () => self.rebuildSeats());
          el.addEventListener('keyup', (e) => { if (e.key === 'Enter') self.rebuildSeats(); });
        }
      });

      const rebuildBtn = document.getElementById('btn-rebuild-seats');
      if (rebuildBtn) rebuildBtn.addEventListener('click', () => self.rebuildSeats());

      const angleSlider = document.getElementById('seatAngleSlider');
      if (angleSlider) {
        angleSlider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value) || 0;
          const display = document.getElementById('seatAngleValDisplay');
          if (display) display.innerText = val + '°';
          const targetSeats = self.getSelectedOrSingleSeats();
          if (targetSeats.length > 0) {
            targetSeats.forEach(s => s.angle = val);
            self.requestGlobalRender();
          }
        });
      }

      const aimBtn = document.getElementById('btn-aim-center');
      if (aimBtn) aimBtn.addEventListener('click', () => self.aimSelectedSeatsToStageCenter());
      const alignBtn = document.getElementById('btn-align-line');
      if (alignBtn) alignBtn.addEventListener('click', () => self.alignSelectedSeats());
    },

    updateHeadZ: function () {
      window.totalHeadZ = window.chair.h + window.seatedTorsoH;
      const el = document.getElementById('seatedTotalHeadZ');
      if (el) el.value = Math.round(window.totalHeadZ);
      this.requestGlobalRender();
    },

    rebuildSeats: function () {
      if (window.saveHistory) window.saveHistory();
      const room = window.room || { w: 14000, d: 26000 };
      const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000 };
      
      // 単一データ源を破棄・再生成
      if (window.seats) window.seats.length = 0; else window.seats = [];
      
      const rows = parseInt(document.getElementById('rows').value) || 16;
      const rowPitch = parseFloat(document.getElementById('rowPitch').value) || 950;
      const seatPitch = parseFloat(document.getElementById('seatPitch').value) || 520;
      const aisleW = parseFloat(document.getElementById('aisleW').value) || 1000;
      const stageDist = parseFloat(document.getElementById('stageDist').value) || 2500;
      const blocks = document.getElementById('blockCols').value.split(',').map(n => parseInt(n.trim()) || 0).filter(n => n > 0);
      if (blocks.length === 0) blocks.push(8);
      
      let totalWidth = 0;
      blocks.forEach((count, i) => { 
        totalWidth += count * seatPitch; 
        if (i < blocks.length - 1) totalWidth += aisleW; 
      });
      
      const startX = (room.w - totalWidth) / 2;
      const startY = stage.y + stage.d + stageDist;
      
      for (let r = 0; r < rows; r++) {
        let curX = startX;
        let seatNum = 1;
        blocks.forEach(count => {
          for (let c = 0; c < count; c++) {
            window.seats.push({ id: `R${r+1}-S${seatNum}`, row: r + 1, x: curX + seatPitch / 2, y: startY + r * rowPitch, angle: 0 });
            curX += seatPitch; seatNum++;
          }
          curX += aisleW;
        });
      }
      this.updateSeatCount();
      if (typeof window.updateStats === 'function') window.updateStats();
      this.requestGlobalRender();
    },

    getSelectedOrSingleSeats: function () {
      const selSeats = [];
      if (window.selectedItems) {
        window.selectedItems.forEach(item => {
          if (item.type === 'seat') {
            const s = window.seats.find(seat => seat.id === item.id);
            if (s) selSeats.push(s);
          }
        });
      }
      if (selSeats.length === 0 && window.selectedSeat) selSeats.push(window.selectedSeat);
      return selSeats;
    },

    aimSelectedSeatsToStageCenter: function () {
      const targetSeats = this.getSelectedOrSingleSeats();
      if (targetSeats.length === 0) return;
      if (window.saveHistory) window.saveHistory();
      const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000 };
      const targetX = stage.x + stage.w / 2;
      const targetY = stage.y + stage.d / 2;

      targetSeats.forEach(s => {
        const rad = Math.atan2(targetY - s.y, targetX - s.x);
        let deg = Math.round((rad * 180 / Math.PI) + 90);
        while (deg > 180) deg -= 360; while (deg <= -180) deg += 360;
        s.angle = deg;
      });
      this.updateSeatAngleUI();
      this.requestGlobalRender();
    },

    alignSelectedSeats: function () {
      const targetSeats = this.getSelectedOrSingleSeats();
      if (targetSeats.length < 2) { alert("整列させるには、複数選択してください。"); return; }
      if (window.saveHistory) window.saveHistory();

      const anchor = targetSeats.reduce((min, s) => (s.x + s.y < min.x + min.y ? s : min), targetSeats[0]);
      const sortedSeats = [...targetSeats].sort((a, b) => {
        return Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y);
      });

      const pitch = parseFloat(document.getElementById('seatPitch').value) || 520;
      const ang = parseFloat(document.getElementById('seatAngleSlider').value) || 0;
      const rad = (ang * Math.PI) / 180;
      
      sortedSeats.forEach((s, idx) => {
        s.angle = ang;
        if (idx > 0) {
          s.x = Math.round(anchor.x + idx * pitch * Math.cos(rad));
          s.y = Math.round(anchor.y + idx * pitch * Math.sin(rad));
        }
      });
      this.requestGlobalRender();
    },

    updateSeatCount: function () {
      const badge = document.getElementById('seatCountBadge');
      if (badge) badge.innerText = `${window.seats.length} 席`;
    },

    updateSeatAngleUI: function () {
      const label = document.getElementById('selectedSeatLabel');
      if (!label) return;
      const targetSeats = this.getSelectedOrSingleSeats();
      if (targetSeats.length === 1) {
        label.innerText = `選択中: ${targetSeats[0].id}`;
        const slider = document.getElementById('seatAngleSlider');
        if(slider) slider.value = targetSeats[0].angle || 0;
        const display = document.getElementById('seatAngleValDisplay');
        if(display) display.innerText = `${targetSeats[0].angle || 0}°`;
      } else if (targetSeats.length > 1) {
        label.innerText = `複数選択中 (${targetSeats.length}席を一括回転)`;
      } else {
        label.innerText = '席未選択 (図面上で席をクリック)';
      }
    },

    requestGlobalRender: function() {
      if (typeof window.requestRender === 'function') window.requestRender();
      else if (typeof window.render === 'function') window.render();
    },

    // ==========================================
    // コアエンジン連動用 API (hitTest / handleDrag)
    // ==========================================
    hitTest: function(wx, wy) {
      if ((window.viewMode || 'top') !== 'top') return null;
      if (!window.seats) return null;

      const chairW = window.chair ? window.chair.w : 480;
      let hit = null;
      
      // 手前に描画されたものから判定
      for (let i = window.seats.length - 1; i >= 0; i--) {
        const s = window.seats[i];
        if (Math.hypot(s.x - wx, s.y - wy) < chairW / 1.5) {
          hit = s;
          break;
        }
      }

      if (window.seatTool === 'delete') {
        if (hit) {
          window.seats = window.seats.filter(s => s.id !== hit.id);
          if (window.saveHistory) window.saveHistory();
          this.updateSeatCount();
          if (typeof window.updateStats === 'function') window.updateStats();
          this.requestGlobalRender();
        }
        return null;
      }

      if (window.seatTool === 'add') {
        const newId = `Custom-${Date.now()}`;
        window.seats.push({ id: newId, row: 0, x: wx, y: wy, angle: 0 });
        if (window.saveHistory) window.saveHistory();
        this.updateSeatCount();
        if (typeof window.updateStats === 'function') window.updateStats();
        this.requestGlobalRender();
        return null;
      }

      if (window.seatTool === 'select' || window.seatTool === 'move') {
        window.selectedSeat = hit;
        this.updateSeatAngleUI();
        if (hit && window.seatTool === 'move') {
          return hit; // ドラッグ対象としてコアエンジンに返す
        }
        if (hit) {
          this.requestGlobalRender();
        }
      }
      return null;
    },

    handleDrag: function(target, wx, wy) {
      if (window.seatTool === 'move' && target) {
        target.x = wx;
        target.y = wy;
      }
    },

    // ==========================================
    // 【平面図】客席描画
    // ==========================================
    drawTop: function (ctx) {
      if (!window.seats || window.seats.length === 0) return;
      
      const chairW = window.chair ? window.chair.w : 480;
      const chairD = window.chair ? window.chair.d : 480;

      window.seats.forEach(s => {
        const isSel = (window.selectedSeat && window.selectedSeat.id === s.id) || 
                      (window.selectedItems && window.selectedItems.some(i => i.type === 'seat' && i.id === s.id));
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate((s.angle || 0) * Math.PI / 180);
        
        ctx.fillStyle = isSel ? '#60a5fa' : '#cbd5e1';
        ctx.strokeStyle = isSel ? '#2563eb' : '#64748b';
        ctx.lineWidth = 6;
        ctx.fillRect(-chairW/2, -chairD/2, chairW, chairD);
        ctx.strokeRect(-chairW/2, -chairD/2, chairW, chairD);
        
        ctx.fillStyle = isSel ? '#3b82f6' : '#94a3b8';
        ctx.fillRect(-chairW/2, chairD/2 - 40, chairW, 40);
        ctx.strokeRect(-chairW/2, chairD/2 - 40, chairW, 40);
        ctx.restore();
      });
    },

    // ==========================================
    // 【立面図】客席スライス抽出と断面描画
    // ==========================================
    getSideViewSliceSeats: function (sliceX) {
      if (!window.seats || window.seats.length === 0) return [];
      const chairW = window.chair ? window.chair.w : 480;

      // 1. スライスの指定がある場合（core_engine から渡された sliceX）
      if (typeof sliceX === 'number' && !isNaN(sliceX)) {
        const matched = window.seats.filter(s => Math.abs(s.x - sliceX) <= chairW * 0.75);
        if (matched.length > 0) return matched;
      }

      // 2. カメラがある場合（カメラの光軸）
      const selCam = window.cameras ? window.cameras.find(c => c.id === window.selectedCamId) : null;
      if (selCam && typeof window.getCameraAimAndFov === 'function') {
        const aimInfo = window.getCameraAimAndFov(selCam);
        if (aimInfo) {
          const dx = aimInfo.targetX - selCam.x;
          const dy = aimInfo.targetY - selCam.y;
          const len = Math.hypot(dx, dy);
          if (len > 10) {
            const seatsInRay = window.seats.filter(s => {
              const perpDist = Math.abs((s.x - selCam.x) * dy - (s.y - selCam.y) * dx) / len;
              return perpDist <= chairW * 0.75;
            });
            if (seatsInRay.length > 0) return seatsInRay;
          }
        }
      }

      // 3. 座席単一選択がある場合
      if (window.selectedSeat) {
        const selX = window.selectedSeat.x;
        const matched = window.seats.filter(s => Math.abs(s.x - selX) <= chairW * 0.75);
        if (matched.length > 0) return matched;
      }

      // 4. フォールバック（デフォルト）：会場のX軸中央付近
      const roomW = (window.room && window.room.w) ? window.room.w : 14000;
      const midX = roomW / 2;
      let closestX = midX;
      let minDiff = Infinity;
      window.seats.forEach(s => {
        const diff = Math.abs(s.x - midX);
        if (diff < minDiff) { minDiff = diff; closestX = s.x; }
      });

      return window.seats.filter(s => Math.abs(s.x - closestX) <= chairW * 0.75);
    },

    calculateBlockedSliceSeats: function (sliceSeats) {
      const blockedSet = new Set();
      const selCam = window.cameras ? window.cameras.find(c => c.id === window.selectedCamId) : null;
      if (!selCam || typeof window.getCameraAimAndFov !== 'function') return blockedSet;

      const aimInfo = window.getCameraAimAndFov(selCam);
      if (!aimInfo) return blockedSet;

      const hFovRad = (aimInfo.fov * Math.PI) / 180;
      const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) * (9 / 16));
      const dy = selCam.y - aimInfo.targetY;
      const dz = aimInfo.targetZ - selCam.lensH;
      const thetaLower = Math.atan2(dz, dy) - vFovRad / 2;
      
      const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
      const cHeight = window.chair ? window.chair.h : 450;
      const torsoHeight = window.seatedTorsoH || 820;

      sliceSeats.forEach(s => {
        if (s.y < selCam.y && s.y > aimInfo.targetY) {
          const isInsideStage = window.isInsideStage ? window.isInsideStage(s.x, s.y) :
                               (s.x >= stage.x && s.x <= stage.x + stage.w &&
                                s.y >= stage.y && s.y <= stage.y + stage.d);
          const baseZ = isInsideStage ? (stage.h || 800) : 0;
          const actualHeadZ = baseZ + cHeight + torsoHeight;

          const distFromCam = selCam.y - s.y;
          const rayZAtSeat = selCam.lensH + distFromCam * Math.tan(thetaLower);
          
          if (rayZAtSeat < actualHeadZ) {
            blockedSet.add(s.id);
          }
        }
      });
      return blockedSet;
    },

    drawSide: function (tCtx, sliceX) {
      if (!window.seats || window.seats.length === 0) return;
      const self = this;

      // カメラがなくても必ず描画されるようにフォールバック抽出
      const sliceSeats = this.getSideViewSliceSeats(sliceX);
      if (sliceSeats.length === 0) return;

      const blockedSeatIds = this.calculateBlockedSliceSeats(sliceSeats);
      const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
      
      const cD = window.chair ? window.chair.d : 480;
      const cH = window.chair ? window.chair.h : 450;
      const cBackH = window.chair ? window.chair.backH : 400;
      const torsoH = window.seatedTorsoH || 820;

      tCtx.save();
      sliceSeats.forEach(s => {
        const py = s.y;
        const isBlocked = blockedSeatIds.has(s.id);
        const isSel = (window.selectedSeat && window.selectedSeat.id === s.id) ||
                      (window.selectedItems && window.selectedItems.some(i => i.type === 'seat' && i.id === s.id));

        const isInsideStage = window.isInsideStage ? window.isInsideStage(s.x, s.y) :
                             (s.x >= stage.x && s.x <= stage.x + stage.w &&
                              s.y >= stage.y && s.y <= stage.y + stage.d);
        const baseZ = isInsideStage ? (stage.h || 800) : 0;

        tCtx.strokeStyle = isBlocked ? '#dc2626' : (isSel ? '#2563eb' : '#475569');
        tCtx.lineWidth = isBlocked ? 35 : 25;

        // 椅子の脚を完全に床またはステージ面 (baseZ) まで接地させる
        tCtx.strokeRect(py - cD / 2, -baseZ - cH, cD, 30); 
        tCtx.beginPath();
        tCtx.moveTo(py - cD / 2 + 40, -baseZ - cH);
        tCtx.lineTo(py - cD / 2 + 40, -baseZ); // 前脚
        tCtx.moveTo(py + cD / 2 - 40, -baseZ - cH);
        tCtx.lineTo(py + cD / 2 - 40, -baseZ); // 後脚
        tCtx.moveTo(py + cD / 2 - 40, -baseZ - cH);
        tCtx.lineTo(py + cD / 2 - 40, -baseZ - cH - cBackH); // 背もたれ
        tCtx.stroke();

        // 観客シルエット
        tCtx.fillStyle = isBlocked ? '#dc2626' : (isSel ? '#2563eb' : '#334155');
        if (typeof window.drawPersonSilhouette === 'function') {
          window.drawPersonSilhouette(tCtx, py, baseZ + cH, torsoH, true, -1);
        } else {
          self.drawFallbackSeatedPerson(tCtx, py, baseZ + cH, torsoH, isBlocked, baseZ);
        }

        // 座席番号ラベル
        tCtx.fillStyle = isBlocked ? '#dc2626' : '#64748b';
        tCtx.font = 'bold 130px sans-serif';
        tCtx.textAlign = 'center';
        tCtx.fillText(s.id, py, -(baseZ + cH + torsoH) - 90);
      });

      // 前席頭頂高ライン（破線ガイド）
      if (sliceSeats.length > 0) {
        tCtx.strokeStyle = 'rgba(220, 38, 38, 0.35)';
        tCtx.lineWidth = 15;
        tCtx.setLineDash([60, 60]);
        tCtx.beginPath();
        const sortedSeats = [...sliceSeats].sort((a,b) => a.y - b.y);
        sortedSeats.forEach((s, idx) => {
          const py = s.y;
          const isInsideStage = window.isInsideStage ? window.isInsideStage(s.x, s.y) :
                               (s.x >= stage.x && s.x <= stage.x + stage.w && s.y >= stage.y && s.y <= stage.y + stage.d);
          const currentZ = -((isInsideStage ? (stage.h||800) : 0) + cH + torsoH);
          if (idx === 0) { tCtx.moveTo(py - 500, currentZ); tCtx.lineTo(py, currentZ); } 
          else { tCtx.lineTo(py, currentZ); }
          if (idx === sortedSeats.length - 1) tCtx.lineTo(py + 500, currentZ);
        });
        tCtx.stroke();
      }
      tCtx.restore();
    },

    drawFallbackSeatedPerson: function (ctx, py, seatTopZ, torsoH, isBlocked, baseZ = 0) {
      const headR = 110;
      const headCenterZ = seatTopZ + torsoH - headR;

      ctx.save();
      ctx.beginPath();
      ctx.arc(py - 30, -headCenterZ, headR, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(py + 40, -seatTopZ - 30);
      ctx.lineTo(py - 50, -headCenterZ + headR * 0.7);
      ctx.lineTo(py - 120, -headCenterZ + headR * 0.8);
      ctx.lineTo(py - 20, -seatTopZ - 30);
      ctx.closePath();
      ctx.fill();

      ctx.fillRect(py - 140, -seatTopZ - 30, 180, 40);
      ctx.fillRect(py - 140, -seatTopZ, 40, seatTopZ - baseZ);
      ctx.restore();
    },

    exportData: function () {
      return { 
        seats: window.seats, 
        chair: window.chair, 
        seatedTorsoH: window.seatedTorsoH, 
        totalHeadZ: window.totalHeadZ 
      };
    },
    
    importData: function (data) {
      if (data) {
        if (data.seats) window.seats = data.seats;
        if (data.chair) window.chair = data.chair;
        if (data.seatedTorsoH) window.seatedTorsoH = data.seatedTorsoH;
        if (data.totalHeadZ) window.totalHeadZ = data.totalHeadZ;
        this.updateSeatCount();
        this.updateHeadZ();
        
        const cw = document.getElementById('chairW');
        if (cw) {
          cw.value = window.chair.w; 
          document.getElementById('chairD').value = window.chair.d;
          document.getElementById('chairH').value = window.chair.h; 
          document.getElementById('chairBackH').value = window.chair.backH;
          document.getElementById('seatedTorsoH').value = window.seatedTorsoH; 
          document.getElementById('seatedTotalHeadZ').value = window.totalHeadZ;
        }
        this.requestGlobalRender();
      }
    }
  };

  window.tabSeatsModule = tabSeatsModule;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tabSeatsModule.init());
  else tabSeatsModule.init();
})();