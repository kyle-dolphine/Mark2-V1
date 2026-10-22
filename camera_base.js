/**
 * camera_base.js
 * カメラ機材スペック定義および配置データの状態管理モジュール
 */
window.CameraBase = (function () {
  'use strict';

  // カメラ機種スペック定義
  const CAMERA_MODELS = {
    nx5r: { name: 'Sony HXR-NX5R', minFov: 3.6, maxFov: 64.5 },
    eng_std: { name: 'ENG 2/3型 標準22倍', minFov: 2.8, maxFov: 58.0 },
    eng_ext: { name: 'ENG 2/3型 (2x Ext)', minFov: 1.4, maxFov: 30.0 },
    box_tele: { name: '大型ボックス40倍', minFov: 0.8, maxFov: 40.0 },
    manual: { name: 'マニュアル', minFov: 0.5, maxFov: 120.0 }
  };

  // 配置済みカメラリスト（初期値）
  let cameras = [
    {
      id: 'CAM1',
      name: 'CAM 1 (正面メイン)',
      model: 'nx5r',
      x: 7000,
      y: 19000,
      lensH: 1700,
      fov: 40,
      shotType: 'stage_ff',
      targetGuestId: 'G1',
      platW: 1000,
      platD: 1000,
      platH: 400,
      pan: 0,
      tilt: 0
    }
  ];

  // 現在選択中のカメラID[cite: 1, 3]
  let selectedCamId = 'CAM1';

  /**
   * 全カメラの配列を取得[cite: 3]
   * @returns {Array<Object>}
   */
  function getAll() {
    return cameras;
  }

  /**
   * 現在選択中のカメラオブジェクトを取得[cite: 3]
   * @returns {Object|null}
   */
  function getSelected() {
    return cameras.find(c => c.id === selectedCamId) || cameras[0] || null;
  }

  /**
   * 選択中のカメラIDを設定[cite: 3]
   * @param {string} id
   */
  function setSelectedId(id) {
    selectedCamId = id;
  }

  /**
   * 新規カメラを追加し、選択状態にする
   * @param {number} [roomW=14000] - 会場全幅
   * @param {number} [stageY=1200] - ステージY座標
   * @param {number} [stageD=3000] - ステージ奥行
   * @returns {Object} 追加されたカメラオブジェクト
   */
  function addCamera(roomW = 14000, stageY = 1200, stageD = 3000) {
    const num = cameras.length + 1;
    const newCam = {
      id: 'CAM' + Date.now(),
      name: `CAM ${num}`,
      model: 'nx5r',
      x: Math.round(roomW / 2),
      y: Math.round(stageY + stageD + 10000),
      lensH: 1650,
      fov: 40,
      shotType: 'stage_ff',
      targetGuestId: '',
      platW: 1000,
      platD: 1000,
      platH: 400,
      pan: 0,
      tilt: 0
    };
    cameras.push(newCam);
    selectedCamId = newCam.id;
    return newCam;
  }

  /**
   * 選択中のカメラを削除する[cite: 2, 3]
   */
  function deleteSelected() {
    cameras = cameras.filter(c => c.id !== selectedCamId);
    selectedCamId = cameras.length > 0 ? cameras[0].id : null;
  }

  /**
   * 指定したカメラのY座標を、客席最後尾から指定距離離した位置に自動配置する[cite: 2, 3]
   * @param {Object} cam - 対象のカメラオブジェクト
   * @param {number} distFromLastRow - 客席最後尾からの離隔距離 (mm)
   * @param {Array<Object>} seats - 客席配列
   * @param {number} [chairD=480] - 椅子の奥行き (mm)
   */
  function alignFromLastRow(cam, distFromLastRow, seats, chairD = 480) {
    if (!cam) return;
    const dist = parseFloat(distFromLastRow) || 0;
    const platDepth = cam.platD || 1000;
    
    let lastRowY = 15000;
    if (Array.isArray(seats) && seats.length > 0) {
      lastRowY = Math.max(...seats.map(s => s.y)) + (chairD / 2);
    }
    
    // 客席最後尾の後端 + 離隔距離 + イントレ台半長
    cam.y = Math.round(lastRowY + dist + (platDepth / 2));
  }

  /**
   * 外部データ（JSON等）を取り込む[cite: 3]
   * @param {Array<Object>} data
   */
  function importData(data) {
    if (Array.isArray(data)) {
      cameras = JSON.parse(JSON.stringify(data));
      if (cameras.length > 0 && !cameras.some(c => c.id === selectedCamId)) {
        selectedCamId = cameras[0].id;
      } else if (cameras.length === 0) {
        selectedCamId = null;
      }
    }
  }

  /**
   * 現在のカメラデータをディープコピーして出力する[cite: 3]
   * @returns {Array<Object>}
   */
  function exportData() {
    return JSON.parse(JSON.stringify(cameras));
  }

  return {
    CAMERA_MODELS,
    getAll,
    getSelected,
    setSelectedId,
    addCamera,
    deleteSelected,
    alignFromLastRow,
    importData,
    exportData
  };
})();