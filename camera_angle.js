/**
 * camera_angle.js - 会場図面 & ENG視界シミュレーター Mark2
 * カメラ角度・光学画角・視線遮蔽（前頭被り）計算モジュール
 * 
 * 外部依存関係なし (Pure Calculation Engine)
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
    // 16:9 アスペクト比における光学計算: tan(V/2) = tan(H/2) * (9/16)
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
   * @param {Array<Object>} guests - 登壇者配列 [{id, name, x, y, h, type}, ...]
   * @param {Object} cameraModels - カメラ機種辞書 { [modelKey]: { minFov, maxFov, ... } }
   * @returns {Object} 照準・光学情報
   */
  function calculateAimAndFov(cam, stage, guests, cameraModels) {
    const safeCam = cam || {};
    const safeStage = stage || { x: 0, y: 0, w: 10000, d: 3000, h: 800 };
    const safeGuests = Array.isArray(guests) ? guests : [];
    
    // カメラモデルのスペック取得 (デフォルト fallback)
    const modelDef = (cameraModels && cameraModels[safeCam.model]) || {
      name: 'Generic Lens',
      minFov: 2.0,
      maxFov: 60.0
    };

    let targetX = safeStage.x + safeStage.w / 2;
    let targetY = safeStage.y + safeStage.d;
    let targetZ = safeStage.h + 1200;
    let calcFov = safeCam.fov || 40;
    let isTeleLimit = false;

    // --- ショットタイプ別の自動エイム＆ズーム計算 ---
    if (safeCam.shotType === 'stage_ff') {
      // ステージ全景 (前縁左右両端を見込む画角 + 余白4度)
      const a1 = Math.atan2((safeStage.y + safeStage.d) - safeCam.y, safeStage.x - safeCam.x);
      const a2 = Math.atan2((safeStage.y + safeStage.d) - safeCam.y, (safeStage.x + safeStage.w) - safeCam.x);
      calcFov = Math.abs(a2 - a1) * (180 / Math.PI) + 4.0;
      targetX = safeStage.x + safeStage.w / 2;
      targetY = safeStage.y + safeStage.d;
      targetZ = safeStage.h + 2200;

    } else if (safeCam.shotType === 'guest_group') {
      // 登壇者全員集合ショット
      if (safeGuests.length > 0) {
        const minX = Math.min(...safeGuests.map(g => g.x - 350));
        const maxX = Math.max(...safeGuests.map(g => g.x + 350));
        const avgY = safeGuests.reduce((sum, g) => sum + g.y, 0) / safeGuests.length;
        const a1 = Math.atan2(avgY - safeCam.y, minX - safeCam.x);
        const a2 = Math.atan2(avgY - safeCam.y, maxX - safeCam.x);
        calcFov = Math.abs(a2 - a1) * (180 / Math.PI) + 6.0;
        targetX = (minX + maxX) / 2;
        targetY = avgY;
        const maxGuestH = Math.max(...safeGuests.map(g => g.h || 0));
        const baseZ = isInsideStage(targetX, targetY, safeStage) ? safeStage.h : 0;
        targetZ = baseZ + maxGuestH + 200;
      }

    } else if (safeCam.shotType === 'guest_single') {
      // 単一登壇者 (バスト〜ウエスト想定 幅800mm画角)
      const tgt = safeGuests.find(g => g.id === safeCam.targetGuestId) || safeGuests[0];
      if (tgt) {
        targetX = tgt.x;
        targetY = tgt.y;
        const dist = Math.hypot(tgt.x - safeCam.x, tgt.y - safeCam.y);
        const reqWidth = 800;
        const idealDeg = (2 * Math.atan((reqWidth / 2) / Math.max(dist, 1))) * (180 / Math.PI);
        
        if (idealDeg < modelDef.minFov) {
          calcFov = modelDef.minFov;
          isTeleLimit = true;
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
    // 会場座標系: Y軸下方向(手前)が客席、Y軸上方向(奥)がステージ
    // カメラ正面(-Y方向)を基準0度としたパン角度
    let panDeg = (hAngle * 180) / Math.PI + 90;
    const groundDist = Math.hypot(targetX - safeCam.x, targetY - safeCam.y);
    let tiltDeg = Math.atan2(targetZ - (safeCam.lensH || 0), Math.max(groundDist, 1)) * (180 / Math.PI);

    // 手動アングル指定モード時は入力パラメータを照準に反映
    if (safeCam.shotType === 'manual_angle') {
      panDeg = safeCam.pan || 0;
      tiltDeg = safeCam.tilt || 0;
      hAngle = (-90 + panDeg) * (Math.PI / 180);
      const tiltRad = tiltDeg * (Math.PI / 180);
      const lookDist = 10000;
      targetX = safeCam.x + lookDist * Math.cos(hAngle);
      targetY = safeCam.y + lookDist * Math.sin(hAngle);
      targetZ = (safeCam.lensH || 0) + lookDist * Math.tan(tiltRad);
    }

    const vFov = getVerticalFov(calcFov);

    return {
      angle: hAngle,       // 既存描画エンジン互換 (ラジアン)
      hAngle: hAngle,      // 水平方向角 (ラジアン)
      panDeg: panDeg,      // 水平パン角 (度数法: 正面0°)
      tiltDeg: tiltDeg,    // 仰角/俯角チルト角 (度数法)
      fov: calcFov,        // 水平画角 (度数法)
      vFov: vFov,          // 垂直画角 (度数法: 16:9)
      targetX: targetX,    // 照準目標 X (mm)
      targetY: targetY,    // 照準目標 Y (mm)
      targetZ: targetZ,    // 照準目標 Z (mm)
      isTeleLimit: isTeleLimit, // テレ端リミット到達フラグ
      modelDef: modelDef
    };
  }

  /**
   * 3. カメラレンズからターゲットへの視線レイと客席頭頂高の干渉（前頭被り）判定
   * @param {Object} cam - カメラオブジェクト {x, y, lensH}
   * @param {Object} aimInfo - calculateAimAndFov の戻り値
   * @param {Array<Object>} seats - 客席配列 [{id, x, y, row, ...}, ...]
   * @param {number} [headZ=1270] - 客席着席時の頭頂高 (mm)
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
      // カメラより前かつ被写体より後ろに存在する客席のみを検査
      if (s.y < cam.y && s.y > aimInfo.targetY) {
        const t = (s.y - cam.y) / dy;
        if (t > 0 && t < 1) {
          const rayXAtSeat = cam.x + t * (aimInfo.targetX - cam.x);
          const rayZAtSeat = camZ + t * (tgtZ - camZ);

          // 視線レイから左右160mm（頭部幅マージン）かつ視線高度が頭頂高を下回る場合
          if (Math.abs(s.x - rayXAtSeat) < 160 && rayZAtSeat < headZ) {
            blockedSeats.push(s);
          }
        }
      }
    });

    return blockedSeats;
  }

  return {
    getVerticalFov: getVerticalFov,
    calculateAimAndFov: calculateAimAndFov,
    checkHeadBlock: checkHeadBlock
  };
})();