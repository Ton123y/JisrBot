import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBodyAndHands,
  classifyHandLandmarks,
  computeBodySpatialContext,
  getCanonicalPoseLandmarks,
  getSampleBodyAndHandsForDatasetSign,
  getSampleLandmarksForSign,
  type HandLandmarkPoint,
} from './handGestureClassifier.ts';

function makeBaseHand(): HandLandmarkPoint[] {
  // Normalized [0..1] upright right hand centered at (0.5, 0.75)
  const pts: HandLandmarkPoint[] = new Array(21).fill(null).map(() => ({ x: 0.5, y: 0.5 }));
  pts[0] = { x: 0.5, y: 0.85 }; // wrist
  pts[1] = { x: 0.42, y: 0.78 };
  pts[2] = { x: 0.38, y: 0.72 };
  pts[3] = { x: 0.36, y: 0.68 };
  pts[4] = { x: 0.44, y: 0.65 }; // thumb curled by default

  // Index
  pts[5] = { x: 0.43, y: 0.62 };
  pts[6] = { x: 0.43, y: 0.53 };
  pts[7] = { x: 0.43, y: 0.58 };
  pts[8] = { x: 0.43, y: 0.64 }; // curled

  // Middle
  pts[9] = { x: 0.49, y: 0.60 };
  pts[10] = { x: 0.49, y: 0.51 };
  pts[11] = { x: 0.49, y: 0.56 };
  pts[12] = { x: 0.49, y: 0.63 }; // curled

  // Ring
  pts[13] = { x: 0.55, y: 0.61 };
  pts[14] = { x: 0.55, y: 0.52 };
  pts[15] = { x: 0.55, y: 0.57 };
  pts[16] = { x: 0.55, y: 0.64 }; // curled

  // Pinky
  pts[17] = { x: 0.61, y: 0.64 };
  pts[18] = { x: 0.61, y: 0.56 };
  pts[19] = { x: 0.61, y: 0.60 };
  pts[20] = { x: 0.61, y: 0.66 }; // curled

  return pts;
}

function extendFinger(pts: HandLandmarkPoint[], mcp: number, pip: number, dip: number, tip: number, xOffset = 0) {
  const base = pts[mcp];
  pts[pip] = { x: base.x + xOffset * 0.3, y: base.y - 0.10 };
  pts[dip] = { x: base.x + xOffset * 0.6, y: base.y - 0.18 };
  pts[tip] = { x: base.x + xOffset, y: base.y - 0.25 };
}

function extendThumbOut(pts: HandLandmarkPoint[]) {
  pts[2] = { x: 0.35, y: 0.72 };
  pts[3] = { x: 0.28, y: 0.64 };
  pts[4] = { x: 0.20, y: 0.56 };
}

test('classifyHandLandmarks detects HELLO when all 5 fingers are spread open', () => {
  const lm = makeBaseHand();
  extendThumbOut(lm);
  extendFinger(lm, 5, 6, 7, 8, -0.05);
  extendFinger(lm, 9, 10, 11, 12, -0.01);
  extendFinger(lm, 13, 14, 15, 16, 0.04);
  extendFinger(lm, 17, 18, 19, 20, 0.09);

  const res = classifyHandLandmarks(lm, 'gestures');
  assert.ok(res);
  assert.equal(res.detectedSignId, 'HELLO');
  assert.equal(res.recognizedWordAr, 'مرحباً');
  assert.equal(res.isLetter, false);
});

test('classifyHandLandmarks detects PEACE when index and middle are extended', () => {
  const lm = makeBaseHand();
  extendFinger(lm, 5, 6, 7, 8, -0.04);
  extendFinger(lm, 9, 10, 11, 12, 0.04);

  const res = classifyHandLandmarks(lm, 'gestures');
  assert.ok(res);
  assert.equal(res.detectedSignId, 'PEACE');
  assert.equal(res.recognizedWordAr, 'سلام');
});

test('classifyHandLandmarks detects Arabic fingerspelling letters in letters mode', () => {
  const lm = makeBaseHand();
  extendThumbOut(lm);
  extendFinger(lm, 5, 6, 7, 8, 0);

  const res = classifyHandLandmarks(lm, 'letters');
  assert.ok(res);
  assert.equal(res.isLetter, true);
  assert.equal(res.recognizedWordAr, 'ل');

  const fist = makeBaseHand();
  const fistRes = classifyHandLandmarks(fist, 'letters');
  assert.ok(fistRes);
  assert.equal(fistRes.isLetter, true);
  assert.equal(fistRes.recognizedWordAr, 'أ');

  // O-ring (thumb & index tip meeting forward away from palm) -> م
  const oRing = makeBaseHand();
  oRing[4] = { x: 0.42, y: 0.48 };
  oRing[8] = { x: 0.44, y: 0.47 };
  const oRes = classifyHandLandmarks(oRing, 'letters');
  assert.ok(oRes);
  assert.equal(oRes.isLetter, true);
  assert.equal(oRes.recognizedWordAr, 'م');
});

test('classifyHandLandmarks never returns single letters in gestures or auto modes across all sample poses', () => {
  const sampleSigns = ['HELLO', 'PEACE', 'GOOD', 'NO', 'LOVE', 'QUESTION', 'CALL_ME', 'OK', 'STOP', 'YES'] as const;
  for (const mode of ['gestures', 'auto'] as const) {
    for (const signId of sampleSigns) {
      const lm = getSampleLandmarksForSign(signId);
      const res = classifyHandLandmarks(lm, mode);
      assert.ok(res, `expected result for ${signId} in ${mode}`);
      assert.equal(res.isLetter, false, `unexpected letter output for ${signId} in ${mode}`);
      assert.ok(res.recognizedWordAr.length > 1, `expected full word for ${signId}, got "${res.recognizedWordAr}"`);
    }

    // L-shape and pinky-only must also produce full words, never 'ل' or 'ن'
    const lShape = makeBaseHand();
    extendThumbOut(lShape);
    extendFinger(lShape, 5, 6, 7, 8, 0);
    const lRes = classifyHandLandmarks(lShape, mode);
    assert.ok(lRes);
    assert.equal(lRes.isLetter, false);
    assert.equal(lRes.recognizedWordAr, 'واحد');

    const pinkyOnly = makeBaseHand();
    extendFinger(pinkyOnly, 17, 18, 19, 20, 0.04);
    const pinkyRes = classifyHandLandmarks(pinkyOnly, mode);
    assert.ok(pinkyRes);
    assert.equal(pinkyRes.isLetter, false);
    assert.equal(pinkyRes.recognizedWordAr, 'تواصل');
  }
});

test('classifyHandLandmarks detects NO when thumb points downward', () => {
  const lm = makeBaseHand();
  lm[2] = { x: 0.36, y: 0.68 };
  lm[3] = { x: 0.32, y: 0.76 };
  lm[4] = { x: 0.28, y: 0.88 };

  const res = classifyHandLandmarks(lm, 'gestures');
  assert.ok(res);
  assert.equal(res.detectedSignId, 'NO');
  assert.equal(res.recognizedWordAr, 'لا');
});

test('computeBodySpatialContext locates both hands relative to head, mouth, and chest pose landmarks', () => {
  const pose = getCanonicalPoseLandmarks();
  const ktab = getSampleBodyAndHandsForDatasetSign('ktab');
  const spatial = computeBodySpatialContext(ktab.hands, pose);
  assert.equal(spatial.bodyDetected, true);
  assert.equal(spatial.handsCount, 2);
  assert.equal(spatial.leftHandZone, 'chest_heart');
  assert.equal(spatial.rightHandZone, 'chest_heart');
  assert.equal(spatial.handsRelation, 'together');
  assert.ok(spatial.locationSummaryAr.includes('الجسم مرصود'));
});

test('classifyBodyAndHands distinguishes two-hand and body-anchored Egyptian Sign Language dataset classes', () => {
  const sabhl = getSampleBodyAndHandsForDatasetSign('sabhl_elkheer');
  const sabhlRes = classifyBodyAndHands(sabhl.hands, sabhl.pose, 'gestures');
  assert.ok(sabhlRes);
  assert.equal(sabhlRes.recognizedWordAr, 'صباح الخير');
  assert.equal(sabhlRes.datasetClass, 'sabhl elkheer');

  const tmam = getSampleBodyAndHandsForDatasetSign('tmam');
  const tmamRes = classifyBodyAndHands(tmam.hands, tmam.pose, 'gestures');
  assert.ok(tmamRes);
  assert.equal(tmamRes.recognizedWordAr, 'تمام');
  assert.equal(tmamRes.datasetClass, 'tmam');

  const ktab = getSampleBodyAndHandsForDatasetSign('ktab');
  const ktabRes = classifyBodyAndHands(ktab.hands, ktab.pose, 'gestures');
  assert.ok(ktabRes);
  assert.equal(ktabRes.recognizedWordAr, 'كتاب');
  assert.equal(ktabRes.spatial?.handsCount, 2);

  const manzel = getSampleBodyAndHandsForDatasetSign('manzel');
  const manzelRes = classifyBodyAndHands(manzel.hands, manzel.pose, 'gestures');
  assert.ok(manzelRes);
  assert.equal(manzelRes.recognizedWordAr, 'بيت');
  assert.equal(manzelRes.datasetClass, 'manzel');

  const mafish = getSampleBodyAndHandsForDatasetSign('mafish');
  const mafishRes = classifyBodyAndHands(mafish.hands, mafish.pose, 'gestures');
  assert.ok(mafishRes);
  assert.equal(mafishRes.recognizedWordAr, 'مفيش');
  assert.equal(mafishRes.datasetClass, 'mafish');

  const helw = getSampleBodyAndHandsForDatasetSign('helw_awy');
  const helwRes = classifyBodyAndHands(helw.hands, helw.pose, 'gestures');
  assert.ok(helwRes);
  assert.equal(helwRes.recognizedWordAr, 'حلو أوي');
  assert.equal(helwRes.datasetClass, 'helw awy');
});
