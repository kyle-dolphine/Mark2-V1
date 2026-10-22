/**
 * tab6_seats.js
 * タブ6：客席配置・個別編集・角度調整 & 立面図描画モジュール
 * ・【修正】window.scale の判定漏れによる平面図（Top View）消失バグを解決
 * ・【修正】立面図での斜め投影を廃止し、コアエンジンのステージや他アイテムと同一のY軸基準で正確に接地・整列するよう修正
 */

(function () {
  'use strict';

  window.seats = window.seats || [];
  window.chair = window.chair || { w: 480, d: 480, h: 420, backH: 400 };
  window.seatedTorsoH = window.seatedTorsoH || 850;
  window.totalHeadZ = window.totalHeadZ || 1270;
  window.seatTool = window.seatTool || 'select';

  const tabSeatsModule = {
    init: function () {
      this.injectUI();
      this.bindEvents();
      this.hookEngineRender();
    },

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
            <button class="btn-action active" id="tool-select" style="flex:1;">👆 選択・範囲</button>
            <button class="btn-action" id="tool-move" style="flex:1;">↔️ ドラッグ</button>
            <button class="btn-action" id="tool-delete" style="flex:1;">❌ 1席削除</button>
            <button class="btn-action" id="tool-add" style="flex:1;">➕ 1席追加</button>
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
              <label style="color:#b91c1c; font-weight:bold;">観客の座高 (頭頂まで)</label>
              <input type="number" id="seatedTorsoH" value="${window.seatedTorsoH}" step="10">
            </div>
            <div class="input-box">
              <label style="color:#b91c1c; font-weight:bold;">前席頭頂高 (Z合計)</label>
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
            <button type="button" class="btn-action" style="font-size:10px; padding:4px; background:#f0fdf4; border-color:#16a34a; color:#15803d;" id="btn-align-line">📏 選択席を1直線に連結整列</button>
            <button type="button" class="btn-action" style="font-size:10px; padding:4px; background:#eff6ff; border-color:#2563eb; color:#1d4ed8;" id="btn-aim-center">🎯 ステージ中央に向ける</button>
          </div>
        </div>
      `;
    },

    bindEvents: function () {
      const self = this;
      
      const tools = ['select', 'move', 'delete', 'add'];
      tools.forEach(t => {
        const btn = document.getElementById('tool-' + t);
        if (btn) {
          btn.onclick = () => {
            window.seatTool = t;
            tools.forEach(tx => document.getElementById('tool-' + tx)?.classList.remove('active'));
            btn.classList.add('active');
          };
        }
      });

      ['chairW', 'chairD', 'chairH', 'chairBackH'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onchange = (e) => {
          if (window.saveHistory) window.saveHistory();
          window.chair[id.replace('chair', '').toLowerCase()] = parseFloat(e.target.value) || 480;
          if (id === 'chairH') self.updateHeadZ();
          self.requestGlobalRender();
        };
      });

      document.getElementById('seatedTorsoH').onchange = (e) => {
        if (window.saveHistory) window.saveHistory();
        window.seatedTorsoH = parseFloat(e.target.value) || 850;
        self.updateHeadZ();
      };
      
      document.getElementById('seatedTotalHeadZ').onchange = (e) => {
        if (window.saveHistory) window.saveHistory();
        window.totalHeadZ = parseFloat(e.target.value) || 1270;
        window.seatedTorsoH = Math.max(400, window.totalHeadZ - window.chair.h);
        document.getElementById('seatedTorsoH').value = Math.round(window.seatedTorsoH);
        self.requestGlobalRender();
      };

      ['rows', 'rowPitch', 'blockCols', 'seatPitch', 'aisleW', 'stageDist'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.onchange = () => self.rebuildSeats();
          el.onkeyup = (e) => { if (e.key === 'Enter') self.rebuildSeats(); };
        }
      });
      document.getElementById('btn-rebuild-seats').onclick = () => self.rebuildSeats();

      const angleSlider = document.getElementById('seatAngleSlider');
      if (angleSlider) {
        angleSlider.oninput = (e) => {
          const val = parseFloat(e.target.value) || 0;
          document.getElementById('seatAngleValDisplay').innerText = val + '°';
          const targetSeats = self.getSelectedOrSingleSeats();
          if (targetSeats.length > 0) {
            targetSeats.forEach(s => s.angle = val);
            self.requestGlobalRender();
          }
        };
      }

      document.getElementById('btn-aim-center').onclick = () => self.aimSelectedSeatsToStageCenter();
      document.getElementById('btn-align-line').onclick = () => self.alignSelectedSeats();
    },

    updateHeadZ: function () {
      window.totalHeadZ = window.chair.h + window.seatedTorsoH;
      document.getElementById('seatedTotalHeadZ').value = Math.round(window.totalHeadZ);
      this.requestGlobalRender();
    },

    rebuildSeats: function () {
      if (window.saveHistory) window.saveHistory();
      const room = window.room || { w: 14000, d: 26000 };
      const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000 };
      
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
      if (typeof window.updateMonitorSimCard === 'function') window.updateMonitorSimCard();
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
        document.getElementById('seatAngleSlider').value = targetSeats[0].angle || 0;
        document.getElementById('seatAngleValDisplay').innerText = `${targetSeats[0].angle || 0}°`;
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

    hookEngineRender: function () {
      const self = this;
      window.updateSeatAngleUI = function () { self.updateSeatAngleUI(); };
      window.updateSeatCountBadge = function () { self.updateSeatCount(); };

      const originalRender = window.render;
      if (typeof originalRender === 'function') {
        window.render = function () {
          originalRender();
          
          if (window.__seatsRenderHookedByCore) return;
          const ctx = document.getElementById('simCanvas')?.getContext('2d');
          if (!ctx) return;

          ctx.save();
          // ★修正点1: window.scaleの未定義チェックを追加。これがないと平面図が消滅します
          if (typeof window.panX !== 'undefined' && typeof window.scale !== 'undefined') {
            ctx.translate(window.panX, window.panY);
            ctx.scale(window.scale, window.scale);
          }
          if ((window.viewMode || 'top') === 'top') self.drawTop(ctx); else self.drawSide(ctx);
          ctx.restore();
        };
      }
    },

    // ==========================================
    // 【平面図】客席描画
    // ==========================================
    drawTop: function (ctx) {
      if (!window.seats) return;
      window.seats.forEach(s => {
        const isSel = (window.selectedSeat && window.selectedSeat.id === s.id) || 
                      (window.selectedItems && window.selectedItems.some(i => i.type === 'seat' && i.id === s.id));
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate((s.angle || 0) * Math.PI / 180);
        
        ctx.fillStyle = isSel ? '#60a5fa' : '#cbd5e1';
        ctx.strokeStyle = isSel ? '#2563eb' : '#64748b';
        ctx.lineWidth = 6;
        ctx.fillRect(-window.chair.w/2, -window.chair.d/2, window.chair.w, window.chair.d);
        ctx.strokeRect(-window.chair.w/2, -window.chair.d/2, window.chair.w, window.chair.d);
        
        ctx.fillStyle = isSel ? '#3b82f6' : '#94a3b8';
        ctx.fillRect(-window.chair.w/2, window.chair.d/2 - 40, window.chair.w, 40);
        ctx.strokeRect(-window.chair.w/2, window.chair.d/2 - 40, window.chair.w, 40);
        ctx.restore();
      });
    },

    // ==========================================
    // 【立面図】客席断面・人物シルエット描画
    // ==========================================
    getSideViewSliceSeats: function (cam, aim) {
      if (!cam || !aim) return [];
      const chairW = window.chair ? window.chair.w : 480;
      const dx = aim.targetX - cam.x;
      const dy = aim.targetY - cam.y;
      const len = Math.hypot(dx, dy);
      if (len < 10) return [];

      return window.seats.filter(s => {
        const perpDist = Math.abs((s.x - cam.x) * dy - (s.y - cam.y) * dx) / len;
        return perpDist <= chairW * 0.75; 
      });
    },

    calculateBlockedSliceSeats: function (sliceSeats, selCam, aimInfo) {
      const blockedSet = new Set();
      if (!selCam || !aimInfo) return blockedSet;

      const hFovRad = (aimInfo.fov * Math.PI) / 180;
      const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) * (9 / 16));
      const dy = selCam.y - aimInfo.targetY;
      const dz = aimInfo.targetZ - selCam.lensH;
      const thetaLower = Math.atan2(dz, dy) - vFovRad / 2;
      
      const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };

      sliceSeats.forEach(s => {
        if (s.y < selCam.y && s.y > aimInfo.targetY) {
          // 正確なZ軸の高さを割り出してカメラレイと交差判定する
          const isInsideStage = (s.x >= stage.x && s.x <= stage.x + stage.w &&
                                 s.y >= stage.y && s.y <= stage.y + stage.d);
          const baseZ = isInsideStage ? (stage.h || 800) : 0;
          const actualHeadZ = baseZ + window.chair.h + window.seatedTorsoH;

          const distFromCam = selCam.y - s.y;
          const rayZAtSeat = selCam.lensH + distFromCam * Math.tan(thetaLower);
          
          if (rayZAtSeat < actualHeadZ) {
            blockedSet.add(s.id);
          }
        }
      });
      return blockedSet;
    },

    drawSide: function (tCtx) {
      if (!window.seats || window.seats.length === 0) return;
      const self = this;
      
      const selCam = window.cameras ? window.cameras.find(c => c.id === window.selectedCamId) : null;
      let aimInfo = null;
      if (selCam && typeof window.getCameraAimAndFov === 'function') {
        aimInfo = window.getCameraAimAndFov(selCam);
      }
      if (!selCam || !aimInfo) return;

      const sliceSeats = this.getSideViewSliceSeats(selCam, aimInfo);
      if (sliceSeats.length === 0) return;

      const blockedSeatIds = this.calculateBlockedSliceSeats(sliceSeats, selCam, aimInfo);
      const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };

      tCtx.save();
      sliceSeats.forEach(s => {
        // ★修正点2: 斜め投影を廃止し、純粋なY座標(奥行き)を横軸にすることで、コアエンジンのステージやテーブルと位置をピッタリ合わせる
        const py = s.y;
        const isBlocked = blockedSeatIds.has(s.id);
        const isSel = (window.selectedSeat && window.selectedSeat.id === s.id) ||
                      (window.selectedItems && window.selectedItems.some(i => i.type === 'seat' && i.id === s.id));

        const isInsideStage = (s.x >= stage.x && s.x <= stage.x + stage.w &&
                               s.y >= stage.y && s.y <= stage.y + stage.d);
        const baseZ = isInsideStage ? (stage.h || 800) : 0;

        tCtx.strokeStyle = isBlocked ? '#dc2626' : (isSel ? '#2563eb' : '#475569');
        tCtx.lineWidth = isBlocked ? 35 : 25;

        // ★修正点3: 椅子の脚を完全に床面(baseZ)まで伸ばし、浮遊を解消
        tCtx.strokeRect(py - window.chair.d / 2, -baseZ - window.chair.h, window.chair.d, 30); 
        tCtx.beginPath();
        tCtx.moveTo(py - window.chair.d / 2 + 40, -baseZ - window.chair.h);
        tCtx.lineTo(py - window.chair.d / 2 + 40, -baseZ); // 前脚
        tCtx.moveTo(py + window.chair.d / 2 - 40, -baseZ - window.chair.h);
        tCtx.lineTo(py + window.chair.d / 2 - 40, -baseZ); // 後脚
        tCtx.moveTo(py + window.chair.d / 2 - 40, -baseZ - window.chair.h);
        tCtx.lineTo(py + window.chair.d / 2 - 40, -baseZ - window.chair.h - window.chair.backH); // 背もたれ
        tCtx.stroke();

        tCtx.fillStyle = isBlocked ? '#dc2626' : (isSel ? '#2563eb' : '#334155');
        if (typeof window.drawPersonSilhouette === 'function') {
          window.drawPersonSilhouette(tCtx, py, baseZ + window.chair.h, window.seatedTorsoH, true, -1);
        } else {
          self.drawFallbackSeatedPerson(tCtx, py, baseZ + window.chair.h, window.seatedTorsoH, isBlocked, baseZ);
        }

        tCtx.fillStyle = isBlocked ? '#dc2626' : '#64748b';
        tCtx.font = 'bold 130px sans-serif';
        tCtx.textAlign = 'center';
        tCtx.fillText(s.id, py, -(baseZ + window.chair.h + window.seatedTorsoH) - 90);
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
          const isInsideStage = (s.x >= stage.x && s.x <= stage.x + stage.w && s.y >= stage.y && s.y <= stage.y + stage.d);
          const currentZ = -((isInsideStage ? (stage.h||800) : 0) + window.chair.h + window.seatedTorsoH);
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
      // 脚を床(baseZ)まで確実に伸ばす
      ctx.fillRect(py - 140, -seatTopZ, 40, seatTopZ - baseZ);
      ctx.restore();
    },

    exportData: function () {
      return { seats: window.seats, chair: window.chair, seatedTorsoH: window.seatedTorsoH, totalHeadZ: window.totalHeadZ };
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
          cw.value = window.chair.w; document.getElementById('chairD').value = window.chair.d;
          document.getElementById('chairH').value = window.chair.h; document.getElementById('chairBackH').value = window.chair.backH;
          document.getElementById('seatedTorsoH').value = window.seatedTorsoH; document.getElementById('seatedTotalHeadZ').value = window.totalHeadZ;
        }
        this.requestGlobalRender();
      }
    }
  };

  window.tabSeatsModule = tabSeatsModule;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tabSeatsModule.init());
  else tabSeatsModule.init();
})();