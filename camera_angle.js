/**
 * camera_angle.js - 会場図面 & ENG視界シミュレーター Mark2
 * カメラ角度・光学画角・視線遮蔽（前頭被り）計算モジュール
 * 
 * 外部依存関係を持たない純粋な計算エンジン (Pure Calculation Engine)
 */
window.CameraAngle = (function () {
  'use strict';

  /**
   * 1. 水平画角(H-FOV)から16:9の垂直画角(V-FOV)を光学計算する
   * @param {number} hFovDeg - 水平画角 (度数法)
   * @returns {number} 垂直画角 (度数法)
   */
  function getVerticalFov(hFovDeg) {
    if (!hFovDeg || hFovDeg <= 0) return 0;
    const hRad = (hFovDeg * Math.PI) / 180;
    // 16:9 アスペクト比における光学計算: tan(V/2) = tan(H/2) * (9/16)[cite: 1, 3]
    const vRad = 2 * Math.atan(Math.tan(hRad / 2) * (9 / 16));
    return (vRad * 180) / Math.PI;
  }

  /**
   * 補助関数: 指定した座標がステージ矩形内にあるか判定
   */
  function isInsideStage(x, y, stage) {
    if (!stage) return false;
    return (
      x >= stage.x &&
      x <= stage.x + stage.w &&
      y >= stage.y &&
      y <= stage.y + stage.d
    );
  }

  /**
   * 2. ショットタイプに応じた自動照準点(Target)、画角(FOV)、パン/チルト角を算出
   * @param {Object} cam - カメラオブジェクト {x, y, lensH, fov, shotType, targetGuestId, pan, tilt, model}
   * @param {Object} stage - ステージ情報 {x, y, w, d, h}
   * @param {Array<Object> | Object} guests - 登壇者配列またはオブジェクト
   * @param {Object} cameraModels - カメラ機種辞書
   * @returns {Object} 照準・光学情報
   */
  function calculateAimAndFov(cam, stage, guests, cameraModels) {
    const safeCam = cam || {};
    const safeStage = stage || { x: 0, y: 0, w: 10000, d: 3000, h: 800 };
    const safeGuests = Array.isArray(guests) ? guests : (guests && guests.list ? guests.list : []);
    
    // カメラモデルのスペック取得 (デフォルト fallback)
    const fallbackModels = {
      nx5r: { name: 'Sony HXR-NX5R', minFov: 3.6, maxFov: 64.5 },
      eng_std: { name: 'ENG 2/3型 標準22倍', minFov: 2.8, maxFov: 58.0 },
      manual: { name: 'マニュアル', minFov: 0.5, maxFov: 120.0 }
    };
    const models = cameraModels || fallbackModels;
    const modelDef = models[safeCam.model] || models.nx5r || { minFov: 2.0, maxFov: 60.0 };

    let targetX = safeStage.x + safeStage.w / 2;
    let targetY = safeStage.y + safeStage.d;
    let targetZ = safeStage.h + 1200; // 人物のおおよその顔の高さ等
    let calcFov = safeCam.fov || 40;
    let isTeleLimit = false;
    let status = 'ok';
    let reqWidth = 0;
    let dist = Math.hypot(targetX - safeCam.x, targetY - safeCam.y);

    // --- ショットタイプ別の自動エイム＆ズーム計算 ---
    if (safeCam.shotType === 'stage_ff') {
      // ステージ全景 (前縁左右両端を見込む画角 + 余白4度)[cite: 1, 2]
      reqWidth = safeStage.w;
      calcFov = Math.max(0.5, (2 * Math.atan((reqWidth / 2) / dist)) * (180 / Math.PI)) + 4.0;
      targetX = safeStage.x + safeStage.w / 2;
      targetY = safeStage.y + safeStage.d;
      targetZ = safeStage.h + 2200;
      if (calcFov > modelDef.maxFov) status = 'wide_limit';

    } else if (safeCam.shotType === 'guest_group') {
      // 登壇者全員集合ショット[cite: 1, 2]
      if (safeGuests.length > 0) {
        let minX = Infinity, maxX = -Infinity;
        safeGuests.forEach(g => {
          if (g.x < minX) minX = g.x;
          if (g.x > maxX) maxX = g.x;
        });
        if (minX <= maxX) {
          targetX = (minX + maxX) / 2;
          reqWidth = (maxX - minX) + 1200; // 余白分
          dist = Math.hypot(targetX - safeCam.x, targetY - safeCam.y);
          calcFov = Math.max(0.5, (2 * Math.atan((reqWidth / 2) / dist)) * (180 / Math.PI));
          if (calcFov > modelDef.maxFov) status = 'wide_limit';
          
          const maxGuestH = Math.max(...safeGuests.map(g => g.h || 0));
          const baseZ = isInsideStage(targetX, targetY, safeStage) ? safeStage.h : 0;
          targetZ = baseZ + maxGuestH + 200;
        }
      }

    } else if (safeCam.shotType === 'guest_single') {
      // 単一登壇者 (バスト〜ウエスト想定 幅800mm画角)[cite: 1, 2]
      const tgt = safeGuests.find(g => g.id === safeCam.targetGuestId) || safeGuests[0];
      if (tgt) {
        targetX = tgt.x;
        targetY = tgt.y;
        dist = Math.hypot(tgt.x - safeCam.x, tgt.y - safeCam.y);
        reqWidth = 800;
        const idealDeg = Math.max(0.5, (2 * Math.atan((reqWidth / 2) / Math.max(dist, 1))) * (180 / Math.PI));
        
        if (idealDeg < modelDef.minFov) {
          calcFov = modelDef.minFov;
          isTeleLimit = true;
          status = 'tele_limit';
        } else if (idealDeg > modelDef.maxFov) {
          calcFov = modelDef.maxFov;
          status = 'wide_limit';
        } else {
          calcFov = idealDeg;
        }
        const baseZ = isInsideStage(tgt.x, tgt.y, safeStage) ? safeStage.h : 0;
        targetZ = baseZ + (tgt.h || 1200) - 150;
      }
    }

    // --- 機種に応じた光学画角リミット制御 ---
    if (safeCam.shotType !== 'manual' && safeCam.shotType !== 'manual_angle') {
      calcFov = Math.min(modelDef.maxFov, Math.max(modelDef.minFov, calcFov));
      safeCam.fov = calcFov;
    }

    // --- 水平角(Angle/Pan)・チルト角(Tilt)の幾何計算 ---
    let hAngle = Math.atan2(targetY - safeCam.y, targetX - safeCam.x);
    // カメラ正面(-Y方向)を基準0度としたパン角度
    let panDeg = (hAngle * 180) / Math.PI + 90;
    const groundDist = Math.hypot(targetX - safeCam.x, targetY - safeCam.y);
    let tiltDeg = Math.atan2(targetZ - (safeCam.lensH || 0), Math.max(groundDist, 1)) * (180 / Math.PI);

    // 手動アングル指定モード時は入力パラメータを照準に反映[cite: 1, 2]
    if (safeCam.shotType === 'manual_angle') {
      panDeg = safeCam.pan || 0;
      tiltDeg = safeCam.tilt || 0;
      hAngle = (-90 + panDeg) * (Math.PI / 180);
      const tiltRad = tiltDeg * (Math.PI / 180);
      const lookDist = 10000;
      targetX = safeCam.x + lookDist * Math.cos(hAngle);
      targetY = safeCam.y + lookDist * Math.sin(hAngle);
      targetZ = (safeCam.lensH || 0) + lookDist * Math.tan(tiltRad);
      calcFov = safeCam.fov;
    }

    const vFov = getVerticalFov(calcFov);

    return {
      angle: hAngle,       // 既存描画エンジン互換 (ラジアン)[cite: 1]
      hAngle: hAngle,      // 水平方向角 (ラジアン)
      panDeg: panDeg,      // 水平パン角 (度数法: 正面0°)
      tiltDeg: tiltDeg,    // 仰角/俯角チルト角 (度数法)
      fov: calcFov,        // 水平画角 (度数法)
      vFov: vFov,          // 垂直画角 (度数法: 16:9)
      targetX: targetX,    // 照準目標 X (mm)
      targetY: targetY,    // 照準目標 Y (mm)
      targetZ: targetZ,    // 照準目標 Z (mm)
      isTeleLimit: isTeleLimit, // テレ端リミット到達フラグ
      status: status,      // 'ok', 'tele_limit', 'wide_limit'[cite: 1]
      modelDef: modelDef,
      reqWidth: reqWidth,
      dist: dist
    };
  }

  /**
   * 3. カメラレンズからターゲットへの視線レイと客席頭頂高の干渉（前頭被り）判定
   * @param {Object} cam - カメラオブジェクト {x, y, lensH}
   * @param {Object} aimInfo - calculateAimAndFov の戻り値
   * @param {Array<Object>} seats - 客席配列 [{id, x, y, row, ...}, ...]
   * @param {number} [headZ=1270] - 客席着席時の頭頂高 (mm)[cite: 1, 2]
   * @returns {Array<Object>} 視線を遮蔽している客席オブジェクトの配列
   */
  function checkHeadBlock(cam, aimInfo, seats, headZ = 1270) {
    const blockedSeats = [];
    if (!cam || !aimInfo || !Array.isArray(seats) || seats.length === 0) {
      return blockedSeats;
    }

    const camZ = cam.lensH || 1600;
    const tgtZ = aimInfo.targetZ;
    const dy = aimInfo.targetY - cam.y;

    // カメラと被写体の距離が極小の場合は判定スキップ
    if (Math.abs(dy) < 1e-4) return blockedSeats;

    seats.forEach(s => {
      // カメラより前かつ被写体より後ろに存在する客席のみを検査[cite: 1, 2]
      if (s.y < cam.y && s.y > aimInfo.targetY) {
        const t = (s.y - cam.y) / dy;
        if (t > 0 && t < 1) {
          const rayXAtSeat = cam.x + t * (aimInfo.targetX - cam.x);
          const rayZAtSeat = camZ + t * (tgtZ - camZ);

          // 視線レイから左右160mm（頭部幅マージン）かつ視線高度が頭頂高を下回る場合[cite: 1, 2]
          if (Math.abs(s.x - rayXAtSeat) < 160 && rayZAtSeat < headZ) {
            blockedSeats.push(s);
          }
        }
      }
    });

    return blockedSeats;
  }

  return {
    getVerticalFov,
    calculateAimAndFov,
    checkHeadBlock
  };
})();