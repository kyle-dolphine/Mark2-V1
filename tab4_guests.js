/**
 * ==============================================================================
 * EQWEL 会場図面 & ENG視界シミュレーター Mark2
 * 【タブ4】登壇者モジュール (tab4_guests.js)
 * 
 * 担当機能:
 * 1. 登壇者リストの管理（追加・削除・選択・0名対応）
 * 2. 平面図（Top View）での右向き描画
 * 3. 立面図（Side View）での【床0 (FL±0) 基準】右向き接地シルエット描画
 * 4. キャンバス上でのクリック選択・ドラッグ移動中継 (hitTest / handleDrag)
 * 5. Undo/Redo (exportData / importData) ＆ 操作パレットUI自動注入
 * ==============================================================================
 */

(function () {
  'use strict';

  const tabGuestsModule = {
    // 登壇者データリスト（baseLevel: 'floor' で床0からスタート）
    list: [
      { id: 'G1', name: '登壇者 1', type: 'high_chair', h: 750, baseLevel: 'floor', x: 6000, y: 2200 },
      { id: 'G2', name: '登壇者 2', type: 'high_chair', h: 750, baseLevel: 'floor', x: 8000, y: 2200 }
    ],
    selectedId: 'G1',
    seatedTorsoH: 850, // 標準的な座高 (mm)

    // 初期化エントリポイント
    init: function () {
      this.injectUI();
      this.updateUI();
      if (typeof window.coreLog === 'function') {
        window.coreLog('登壇者モジュール (tab4_guests.js) が初期化されました', 'info');
      }
    },

    // ==========================================================================
    // 1. データ操作メソッド
    // ==========================================================================
    // 登壇者の追加
    add: function () {
      if (typeof window.saveHistory === 'function') window.saveHistory();
      
      const num = this.list.length + 1;
      const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
      
      const offsetX = (num % 2 === 0 ? 1 : -1) * (Math.floor(num / 2) * 900);
      const newGuest = {
        id: 'G' + Date.now(),
        name: `登壇者 ${num}`,
        type: 'high_chair',
        h: 750,
        baseLevel: 'floor', // 基本は床0スタート
        x: Math.round(stage.x + stage.w / 2 + offsetX),
        y: Math.round(stage.y + stage.d / 2)
      };

      this.list.push(newGuest);
      this.selectedId = newGuest.id;
      this.updateUI();
      
      if (typeof window.requestRender === 'function') window.requestRender();
      else if (typeof window.render === 'function') window.render();
    },

    // 登壇者の削除（0人まで削除可能）
    removeSelected: function () {
      if (this.list.length === 0) return;
      if (typeof window.saveHistory === 'function') window.saveHistory();

      this.list = this.list.filter(g => g.id !== this.selectedId);
      this.selectedId = this.list.length > 0 ? this.list[0].id : null;
      this.updateUI();
      
      if (typeof window.requestRender === 'function') window.requestRender();
      else if (typeof window.render === 'function') window.render();
    },

    // 選択中プロパティの更新
    updateSelected: function (props, recordHistory = false) {
      if (!this.selectedId) return;
      if (recordHistory && typeof window.saveHistory === 'function') {
        window.saveHistory();
      }
      const g = this.list.find(item => item.id === this.selectedId);
      if (g) {
        Object.assign(g, props);
        if (typeof window.requestRender === 'function') window.requestRender();
        else if (typeof window.render === 'function') window.render();
      }
    },

    // 基準高さ（Z=0 床面 または ステージ天板）の取得
    getGuestBaseZ: function (g) {
      // 基本は床0 (0mm) からスタート
      if (!g.baseLevel || g.baseLevel === 'floor') {
        return 0;
      }
      // 'stage' 指定の場合のみステージ高を加算
      const stage = window.stage || { h: 800 };
      return stage.h || 0;
    },

    // ==========================================================================
    // 2. 描画メソッド (core_engine.js から直接呼び出し)
    // ==========================================================================
    // 【平面図】描画 (右向き: +X方向)
    drawTop: function (ctx) {
      if (this.list.length === 0) return;

      this.list.forEach(g => {
        const isSel = (g.id === this.selectedId);
        
        ctx.save();
        ctx.fillStyle = isSel ? '#2563eb' : '#0f172a';
        ctx.strokeStyle = isSel ? '#2563eb' : '#0f172a';

        // 1. 肩幅・胴体ベース
        ctx.beginPath();
        ctx.arc(g.x, g.y, 200, 0, Math.PI * 2);
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = isSel ? 35 : 20;
        ctx.stroke();

        // 2. 頭部（やや右寄り）
        ctx.beginPath();
        ctx.arc(g.x + 45, g.y, 85, 0, Math.PI * 2);
        ctx.fill();

        // 3. 視線コーン / 鼻先（右向きの三角形）
        ctx.beginPath();
        ctx.moveTo(g.x + 130, g.y);
        ctx.lineTo(g.x + 220, g.y - 45);
        ctx.lineTo(g.x + 220, g.y + 45);
        ctx.closePath();
        ctx.fill();

        // 4. ラベル表示
        const typeBadge = g.type === 'high_chair' ? '[H]' : (g.type === 'low_chair' ? '[L]' : '[立]');
        const lvlBadge = (g.baseLevel === 'stage') ? ' (台)' : '';
        ctx.fillStyle = isSel ? '#2563eb' : '#0f172a';
        ctx.font = 'bold 150px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        this.drawOutlinedText(ctx, `${g.name} ${typeBadge}${lvlBadge}`, g.x, g.y - 250);

        ctx.restore();
      });
    },

    // 【立面図】描画 (基本は床0スタート: posY = -baseZ)
    drawSide: function (ctx) {
      if (this.list.length === 0) return;

      this.list.forEach(g => {
        const isSel = (g.id === this.selectedId);
        const baseZ = this.getGuestBaseZ(g); // 基本は 0

        const posX = g.y;       // 立面図の横軸は Y (会場奥行き)
        const posY = -baseZ;     // 床0基準 (床面は Y=0)

        ctx.save();
        ctx.strokeStyle = isSel ? '#2563eb' : '#0f172a';
        ctx.fillStyle = isSel ? '#2563eb' : '#0f172a';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (g.type === 'standing') {
          // 立ち姿（足元が床0に接地）
          this.drawPersonRight(ctx, posX, posY, g.h, false);
        } else if (g.type === 'high_chair') {
          // ハイチェア（脚が床0に接地）
          this.drawHighChairRight(ctx, posX, posY, g.h);
          this.drawPersonRight(ctx, posX, posY - g.h, this.seatedTorsoH, true, g.h);
        } else {
          // ローチェア（脚が床0に接地）
          this.drawLowChairRight(ctx, posX, posY, g.h);
          this.drawPersonRight(ctx, posX, posY - g.h, this.seatedTorsoH, true, g.h);
        }

        // ラベル表示
        ctx.fillStyle = isSel ? '#2563eb' : '#0f172a';
        ctx.font = 'bold 180px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const zInfo = (baseZ > 0) ? ` (台+${baseZ})` : '';
        this.drawOutlinedText(ctx, `${g.name} (H:${g.h}${zInfo})`, posX, posY - g.h - (g.type === 'standing' ? 200 : 950));

        ctx.restore();
      });
    },

    // 🪑 ハイチェア（右向きシルエット・床 y から座面 y - h まで）
    drawHighChairRight: function (ctx, x, y, h) {
      ctx.lineWidth = 18;
      ctx.beginPath();
      // 後脚（左）・前脚（右）: 床 y からまっすぐ接地
      ctx.moveTo(x - 90, y); ctx.lineTo(x - 40, y - h);
      ctx.moveTo(x + 90, y); ctx.lineTo(x + 40, y - h);
      // 座面
      ctx.moveTo(x - 140, y - h); ctx.lineTo(x + 140, y - h);
      // 背もたれ（左側=後ろ）
      ctx.moveTo(x - 140, y - h); ctx.lineTo(x - 140, y - h - 260);
      // 足置きステップ
      ctx.moveTo(x - 60, y - h * 0.45); ctx.lineTo(x + 90, y - h * 0.45);
      ctx.stroke();
    },

    // 💺 ローチェア（右向きシルエット・床 y から座面 y - h まで）
    drawLowChairRight: function (ctx, x, y, h) {
      ctx.lineWidth = 18;
      ctx.beginPath();
      // 座面クッション
      ctx.strokeRect(x - 160, y - h, 320, 40);
      // 後脚・前脚: 床 y にしっかり接地
      ctx.moveTo(x - 120, y - h); ctx.lineTo(x - 120, y);
      ctx.moveTo(x + 120, y - h); ctx.lineTo(x + 120, y);
      // 背もたれ（左側=後ろ）
      ctx.moveTo(x - 160, y - h); ctx.lineTo(x - 160, y - h - 360);
      ctx.stroke();
    },

    // 🧍 人物シルエット（右向き）
    drawPersonRight: function (ctx, x, y, h, isSeated, chairH = 0) {
      ctx.lineWidth = 26;

      if (isSeated) {
        // 座り姿勢 (y は座面高さ)
        // 1. 胴体
        ctx.beginPath();
        ctx.moveTo(x - 40, y); 
        ctx.lineTo(x - 40, y - h + 180);
        // 2. 太もも (右方向へ)
        ctx.moveTo(x - 40, y - 50);
        ctx.lineTo(x + 150, y - 50);
        
        // 3. すね (ローチェアなら床へ、ハイチェアなら足置きステップへ接地)
        const footDrop = (chairH > 500) ? (chairH * 0.55) : chairH;
        ctx.lineTo(x + 150, y + footDrop);
        // 足先（右向きの靴）
        ctx.lineTo(x + 210, y + footDrop);
        ctx.stroke();

        // 4. 頭部（右向き前傾）
        ctx.beginPath();
        ctx.arc(x + 20, y - h + 90, 85, 0, Math.PI * 2);
        ctx.fill();

        // 5. 鼻先（右向き）
        ctx.beginPath();
        ctx.moveTo(x + 95, y - h + 90);
        ctx.lineTo(x + 150, y - h + 90);
        ctx.lineTo(x + 110, y - h + 115);
        ctx.fill();
      } else {
        // 直立姿勢 (y は床面)
        ctx.beginPath();
        // 足元から胴体へ
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - h + 180);
        // 足先（靴）
        ctx.moveTo(x, y);
        ctx.lineTo(x + 80, y);
        ctx.stroke();

        // 腕
        ctx.beginPath();
        ctx.lineWidth = 18;
        ctx.moveTo(x, y - h + 260);
        ctx.lineTo(x + 30, y - h + 540);
        ctx.stroke();

        // 頭部
        ctx.beginPath();
        ctx.arc(x, y - h + 90, 85, 0, Math.PI * 2);
        ctx.fill();

        // 鼻先（右向き）
        ctx.beginPath();
        ctx.moveTo(x + 75, y - h + 90);
        ctx.lineTo(x + 130, y - h + 90);
        ctx.lineTo(x + 90, y - h + 115);
        ctx.fill();
      }
    },

    // 文字輪郭描画
    drawOutlinedText: function (ctx, text, x, y) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 40;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      ctx.restore();
    },

    // ==========================================================================
    // 3. マウス操作・当たり判定
    // ==========================================================================
    hitTest: function (wx, wy) {
      if (this.list.length === 0) return null;

      const viewMode = window.viewMode || 'top';

      for (let i = this.list.length - 1; i >= 0; i--) {
        const g = this.list[i];

        if (viewMode === 'top') {
          // 平面図：中心からの距離判定
          const dist = Math.hypot(g.x - wx, g.y - wy);
          if (dist <= 300) {
            this.selectedId = g.id;
            this.updateUI();
            if (typeof window.switchTab === 'function') window.switchTab('guests');
            return {
              type: 'guest',
              item: g,
              offsetX: wx - g.x,
              offsetY: wy - g.y
            };
          }
        } else {
          // 立面図：床0基準 (posY = -baseZ)
          const baseZ = this.getGuestBaseZ(g);
          const topZ = baseZ + g.h + (g.type === 'standing' ? 100 : this.seatedTorsoH);
          
          if (Math.abs(wx - g.y) <= 300 && wy <= -baseZ + 100 && wy >= -topZ - 200) {
            this.selectedId = g.id;
            this.updateUI();
            if (typeof window.switchTab === 'function') window.switchTab('guests');
            return {
              type: 'guest_side',
              item: g,
              offsetX: wx - g.y
            };
          }
        }
      }
      return null;
    },

    handleDrag: function (target, wx, wy) {
      if (target.type === 'guest') {
        // 平面図ドラッグ
        target.item.x = Math.round(wx - target.offsetX);
        target.item.y = Math.round(wy - target.offsetY);
      } else if (target.type === 'guest_side') {
        // 立面図ドラッグ：Y (奥行き) を移動
        target.item.y = Math.round(wx - target.offsetX);
      }
      this.syncInputs();
    },

    // ==========================================================================
    // 4. UI自己注入 ＆ イベントバインド
    // ==========================================================================
    injectUI: function () {
      const panel = document.getElementById('panel-guests');
      if (!panel) return;

      panel.innerHTML = `
        <div class="ui-group">
          <div class="ui-group-title">
            <span>👤 登壇者選択</span>
            <div style="display:flex; gap:4px;">
              <button class="btn-action" id="btn-add-guest" style="padding:2px 8px; font-size:10px;">＋ 追加</button>
              <button class="btn-action" id="btn-del-guest" style="padding:2px 8px; font-size:10px; color:#b91c1c;">🗑️ 削除</button>
            </div>
          </div>
          <div class="input-box" style="margin-bottom:6px;">
            <select id="guest-select"></select>
          </div>
        </div>

        <div class="ui-group">
          <div class="ui-group-title">登壇者パラメータ設定</div>
          <div class="input-row" style="margin-bottom:6px;">
            <div class="input-box">
              <label>表示名</label>
              <input type="text" id="guest-name" value="登壇者 1">
            </div>
            <div class="input-box">
              <label>着座スタイル</label>
              <select id="guest-type">
                <option value="high_chair">🪑 ハイチェア (座面H:750)</option>
                <option value="low_chair">💺 ローチェア (座面H:420)</option>
                <option value="standing">🧍 立ち姿 (身長H:1600)</option>
              </select>
            </div>
          </div>
          
          <div class="input-row" style="margin-bottom:6px;">
            <div class="input-box">
              <label>設置基準面</label>
              <select id="guest-base-level">
                <option value="floor">🟩 床面 0 (FL±0 スタート)</option>
                <option value="stage">🏛️ ステージ天板上</option>
              </select>
            </div>
            <div class="input-box">
              <label>座面/身長 H (mm)</label>
              <input type="number" id="guest-h" value="750" step="50">
            </div>
          </div>

          <div class="input-row">
            <div class="input-box">
              <label>配置 X (幅 mm)</label>
              <input type="number" id="guest-x" value="6000" step="100">
            </div>
            <div class="input-box">
              <label>配置 Y (奥行 mm)</label>
              <input type="number" id="guest-y" value="2200" step="100">
            </div>
          </div>

          <div class="input-row" style="margin-top:6px;">
            <div class="input-box" style="width:100%;">
              <button class="btn-action" id="btn-guest-center" style="width:100%; font-size:10px; height:28px;">🎯 舞台中央へ配置</button>
            </div>
          </div>
        </div>
      `;

      // イベントリスナー設定
      document.getElementById('btn-add-guest').onclick = () => this.add();
      document.getElementById('btn-del-guest').onclick = () => this.removeSelected();

      document.getElementById('guest-select').onchange = (e) => {
        this.selectedId = e.target.value;
        this.syncInputs();
        if (typeof window.requestRender === 'function') window.requestRender();
        else if (typeof window.render === 'function') window.render();
      };

      document.getElementById('guest-name').oninput = (e) => {
        this.updateSelected({ name: e.target.value });
        const opt = document.querySelector(`#guest-select option[value="${this.selectedId}"]`);
        if (opt) opt.innerText = e.target.value;
      };

      document.getElementById('guest-type').onchange = (e) => {
        const type = e.target.value;
        let defaultH = 750;
        if (type === 'low_chair') defaultH = 420;
        if (type === 'standing') defaultH = 1600;
        
        document.getElementById('guest-h').value = defaultH;
        this.updateSelected({ type: type, h: defaultH }, true);
      };

      document.getElementById('guest-base-level').onchange = (e) => {
        this.updateSelected({ baseLevel: e.target.value }, true);
      };

      document.getElementById('guest-h').onchange = (e) => {
        this.updateSelected({ h: parseFloat(e.target.value) || 0 }, true);
      };

      document.getElementById('guest-x').onchange = (e) => {
        this.updateSelected({ x: parseFloat(e.target.value) || 0 }, true);
      };

      document.getElementById('guest-y').onchange = (e) => {
        this.updateSelected({ y: parseFloat(e.target.value) || 0 }, true);
      };

      document.getElementById('btn-guest-center').onclick = () => {
        if (!this.selectedId) return;
        const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000 };
        const cx = Math.round(stage.x + stage.w / 2);
        const cy = Math.round(stage.y + stage.d / 2);
        document.getElementById('guest-x').value = cx;
        document.getElementById('guest-y').value = cy;
        this.updateSelected({ x: cx, y: cy }, true);
      };
    },

    updateUI: function () {
      const select = document.getElementById('guest-select');
      const delBtn = document.getElementById('btn-del-guest');
      const centerBtn = document.getElementById('btn-guest-center');
      const nameEl = document.getElementById('guest-name');
      const typeEl = document.getElementById('guest-type');
      const baseEl = document.getElementById('guest-base-level');
      const hEl = document.getElementById('guest-h');
      const xEl = document.getElementById('guest-x');
      const yEl = document.getElementById('guest-y');

      if (!select) return;

      select.innerHTML = '';

      // 0名時のフォーム保護
      if (this.list.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.innerText = '（登壇者なし / 0名）';
        select.appendChild(opt);
        select.disabled = true;

        if (delBtn) delBtn.disabled = true;
        if (centerBtn) centerBtn.disabled = true;
        if (nameEl) { nameEl.value = ''; nameEl.disabled = true; }
        if (typeEl) { typeEl.disabled = true; }
        if (baseEl) { baseEl.disabled = true; }
        if (hEl) { hEl.value = ''; hEl.disabled = true; }
        if (xEl) { xEl.value = ''; xEl.disabled = true; }
        if (yEl) { yEl.value = ''; yEl.disabled = true; }
        return;
      }

      // 1人以上いる場合は活性化
      select.disabled = false;
      if (delBtn) delBtn.disabled = false;
      if (centerBtn) centerBtn.disabled = false;
      if (nameEl) nameEl.disabled = false;
      if (typeEl) typeEl.disabled = false;
      if (baseEl) baseEl.disabled = false;
      if (hEl) hEl.disabled = false;
      if (xEl) xEl.disabled = false;
      if (yEl) yEl.disabled = false;

      this.list.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.name;
        select.appendChild(opt);
      });

      if (!this.selectedId || !this.list.some(g => g.id === this.selectedId)) {
        this.selectedId = this.list[0].id;
      }
      select.value = this.selectedId;

      this.syncInputs();
    },

    syncInputs: function () {
      if (!this.selectedId) return;
      const sel = this.list.find(g => g.id === this.selectedId);
      if (!sel) return;

      const nameEl = document.getElementById('guest-name');
      const typeEl = document.getElementById('guest-type');
      const baseEl = document.getElementById('guest-base-level');
      const hEl = document.getElementById('guest-h');
      const xEl = document.getElementById('guest-x');
      const yEl = document.getElementById('guest-y');

      if (nameEl) nameEl.value = sel.name;
      if (typeEl) typeEl.value = sel.type;
      if (baseEl) baseEl.value = sel.baseLevel || 'floor';
      if (hEl) hEl.value = sel.h;
      if (xEl) xEl.value = Math.round(sel.x);
      if (yEl) yEl.value = Math.round(sel.y);
    },

    // ==========================================================================
    // 5. データ入出力インターフェース (Undo/Redo & JSON保存)
    // ==========================================================================
    exportData: function () {
      const data = JSON.parse(JSON.stringify(this.list));
      data.selectedId = this.selectedId;
      return data;
    },

    importData: function (data) {
      if (!data) return;
      if (Array.isArray(data)) {
        this.list = data;
        this.selectedId = data.selectedId || (this.list[0] ? this.list[0].id : null);
      } else if (data.list && Array.isArray(data.list)) {
        this.list = data.list;
        this.selectedId = data.selectedId || (this.list[0] ? this.list[0].id : null);
      } else {
        const extractedList = Object.values(data).filter(item => typeof item === 'object' && item.id);
        if (extractedList.length > 0) {
          this.list = extractedList;
          this.selectedId = data.selectedId || extractedList[0].id;
        } else {
          this.list = [];
          this.selectedId = null;
        }
      }
      this.updateUI();
      if (typeof window.requestRender === 'function') window.requestRender();
      else if (typeof window.render === 'function') window.render();
    }
  };

  // グローバル公開
  window.tabGuestsModule = tabGuestsModule;

  // DOMロード時に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => tabGuestsModule.init());
  } else {
    tabGuestsModule.init();
  }
})();