import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFt8AutoReplyPayload,
  buildFt8RowClickDraft,
  canAutoReplyFt8Row,
  clampAndStepRttyFineOffset,
  decodeBase64ToRgb,
  decodeBaudotChars,
  decodeJttyChars,
  demodulateJttyPcm,
  demodulateRttyPcm,
  demodulateSstvAudioToRgb,
  detectCountryFromTimeZone,
  encodeBaudotChars,
  encodeFt8Tones,
  encodeJttyChars,
  encodeRgbToBase64,
  findNearestRttySignalOffsetHz,
  formatFt8Cq,
  formatFt8Reply,
  formatFt8SnrReport,
  formatHrCallsign,
  generateSstvTestPattern,
  getHrCountrySpec,
  getJttyMarkSpaceFreqs,
  getRttyMarkSpaceFreqs,
  getStandardJttyFrequency,
  getStandardRttyFrequency,
  getStandardSstvFrequency,
  isValidHamCallsign,
  jttyDurationMs,
  jttyMarkSpaceTimeline,
  luminanceToSstvFreqHz,
  parseFt8Message,
  resolveFt8ReportTarget,
  romajiToKatakana,
  rttyDurationMs,
  rttyMarkSpaceTimeline,
  sanitizeFt8DraftInput,
  sanitizeJttyText,
  SSTV_HEIGHT,
  SSTV_WIDTH,
  sstvFreqHzToLuminance,
  stepRttyFineOffset,
  synthesizeJttyAudioPcm,
  synthesizeRttyAudioPcm,
  synthesizeSstvAudioPcm,
} from './digitalModes';

test('HR callsign generator maps UK to 26HR prefix starting at 001 and validates licensed ham calls', () => {
  assert.equal(getHrCountrySpec('GB').division, '26');
  assert.equal(getHrCountrySpec('ZA').division, '44');
  assert.equal(formatHrCallsign('GB', 1), '26HR001');
  assert.equal(formatHrCallsign('ZA', 1), '44HR001');
  assert.equal(formatHrCallsign('US', 7), '2HR007');
  assert.equal(formatHrCallsign('GB', 123), '26HR123');
  assert.equal(formatHrCallsign('ZA', 105), '44HR105');
  assert.equal(detectCountryFromTimeZone('Europe/London'), 'GB');
  assert.equal(detectCountryFromTimeZone('Africa/Johannesburg'), 'ZA');

  assert.equal(isValidHamCallsign('ZS1ROM'), true);
  assert.equal(isValidHamCallsign('M0ABC/P'), true);
  assert.equal(isValidHamCallsign('26HR001'), false);
});

test('RTTY ITA2 Baudot encoder/decoder preserves letters, numbers, and punctuation', () => {
  const msg = 'CQ CQ DE ZS1ROM 599 K';
  const words = encodeBaudotChars(msg);
  assert.equal(decodeBaudotChars(words), msg);

  const segs = rttyMarkSpaceTimeline('RYRY');
  assert.ok(segs.length > 20);
  assert.ok(segs.some((s) => s.freqHz === 2125) && segs.some((s) => s.freqHz === 2295));
  assert.ok(rttyDurationMs('RYRY') > 500);
  assert.equal(getStandardRttyFrequency('20m'), 14_085_000);
});

test('RTTY FSK PCM modulator and Goertzel DSP demodulator recover exact text across modes', () => {
  const msg = 'CQ DE ZS1ROM 599 KG43 K';
  const pcmStd = synthesizeRttyAudioPcm(msg, 16000, { baudRate: 45.45, shiftHz: 170, markHz: 2125, uos: true });
  const decStd = demodulateRttyPcm(pcmStd, 16000, { baudRate: 45.45, shiftHz: 170, markHz: 2125, uos: true });
  assert.equal(decStd.text, msg);
  assert.ok(decStd.markSnrRatio > 5);

  const pcmFastRev = synthesizeRttyAudioPcm('RYRY 73 DE 26HR123', 16000, {
    baudRate: 75,
    shiftHz: 425,
    markHz: 1275,
    reversePolarity: true,
    uos: true,
  });
  const decFastRev = demodulateRttyPcm(pcmFastRev, 16000, {
    baudRate: 75,
    shiftHz: 425,
    markHz: 1275,
    reversePolarity: true,
    uos: true,
  });
  assert.equal(decFastRev.text, 'RYRY 73 DE 26HR123');
});

test('FT8 message formatter, parser, and 79-symbol Costas 8-FSK encoder', () => {
  const cq = formatFt8Cq('ZS1ROM', 'KG43');
  assert.equal(cq, 'CQ ZS1ROM KG43');
  const parsed = parseFt8Message(cq);
  assert.equal(parsed.isCq, true);
  assert.equal(parsed.fromCall, 'ZS1ROM');
  assert.equal(parsed.extra, 'KG43');

  const reply = formatFt8Reply('G4XYZ', '26HR123', '-08');
  assert.equal(reply, 'G4XYZ 26HR123 -08');

  const tones = encodeFt8Tones(cq);
  assert.equal(tones.length, 79);
  assert.ok(tones.every((t) => t >= 0 && t <= 7));
  assert.deepEqual(tones.slice(0, 7), [3, 1, 4, 0, 6, 5, 2]);
  assert.deepEqual(tones.slice(36, 43), [3, 1, 4, 0, 6, 5, 2]);

  assert.equal(
    canAutoReplyFt8Row({ direction: 'RX', isCq: true, callsign: 'ZS2DX' }, 'ZS1ROM'),
    true
  );
  assert.equal(
    canAutoReplyFt8Row({ direction: 'RX', isCq: false, callsign: 'ZS2DX' }, 'ZS1ROM'),
    false
  );
  assert.equal(
    canAutoReplyFt8Row({ direction: 'TX', isCq: true, callsign: 'ZS1ROM' }, 'ZS1ROM'),
    false
  );
  assert.equal(
    canAutoReplyFt8Row({ direction: 'RX', isCq: true, callsign: 'ZS1ROM' }, 'ZS1ROM'),
    false
  );
  assert.deepEqual(
    buildFt8AutoReplyPayload({ callsign: 'zs2dx', audioFreqHz: 1500 }, '26HR123', 'kg43ab', 1250),
    { dxCall: 'ZS2DX', message: 'ZS2DX 26HR123 KG43', audioFreqHz: 1500 }
  );
});

test('SSTV scanline luminance frequency mapping, RGB roundtrip, and FM audio demodulation', () => {
  assert.equal(luminanceToSstvFreqHz(0), 1500);
  assert.equal(luminanceToSstvFreqHz(255), 2300);
  assert.equal(sstvFreqHzToLuminance(1900), 128);
  assert.equal(getStandardSstvFrequency('20m'), 14_230_000);

  const rgb = generateSstvTestPattern('bars', SSTV_WIDTH, SSTV_HEIGHT);
  assert.equal(rgb.length, SSTV_WIDTH * SSTV_HEIGHT * 3);
  const b64 = encodeRgbToBase64(rgb);
  const restored = decodeBase64ToRgb(b64, rgb.length);
  assert.deepEqual(restored, rgb);

  // Real SSTV FM audio synthesis -> demodulation on a 64x48 test frame for fast CI execution
  const w = 64;
  const h = 48;
  const card = generateSstvTestPattern('bars', w, h);
  for (const mode of ['Robot 36', 'Martin M1'] as const) {
    const pcm = synthesizeSstvAudioPcm(card, w, h, mode, 24000, 5);
    const dec = demodulateSstvAudioToRgb(pcm, w, h, mode, 24000, 5);
    assert.equal(dec.visDetected, true);
    assert.equal(dec.syncLockCount, h);
    let maxErr = 0;
    for (let i = 0; i < card.length; i++) {
      maxErr = Math.max(maxErr, Math.abs(card[i] - dec.rgb[i]));
    }
    assert.ok(maxErr <= 18, `Expected decoded pixel error <= 18 for ${mode}, got ${maxErr}`);
  }
});

import { getTxToneProfile } from './digitalModes';

test('getTxToneProfile returns authentic audio frequencies for CW, RTTY, SSTV, and FT8 TX', () => {
  assert.deepEqual(getTxToneProfile('CW'), { hasTone: true, modeLabel: 'CW', baseFreqHz: 720 });
  assert.deepEqual(getTxToneProfile('RTTY', { markHz: 2125, shiftHz: 170 }), {
    hasTone: true,
    modeLabel: 'RTTY',
    baseFreqHz: 2125,
    secondaryFreqHz: 2295,
  });
  assert.deepEqual(getTxToneProfile('SSTV'), {
    hasTone: true,
    modeLabel: 'SSTV',
    baseFreqHz: 1900,
    secondaryFreqHz: 1200,
  });
  assert.deepEqual(getTxToneProfile('FT8', {}, 1500), {
    hasTone: true,
    modeLabel: 'FT8',
    baseFreqHz: 1500,
    secondaryFreqHz: 1543.75,
  });
  assert.equal(getTxToneProfile('USB').hasTone, false);
});

test('formatFt8SnrReport and resolveFt8ReportTarget handle DX call resolution and fallback SNR', () => {
  assert.equal(formatFt8SnrReport(-7), '-07');
  assert.equal(formatFt8SnrReport(0), '+00');
  assert.equal(formatFt8SnrReport(5), '+05');
  assert.equal(formatFt8SnrReport(-40), '-24');
  assert.equal(formatFt8SnrReport(40), '+24');

  const log = [
    { direction: 'RX' as const, callsign: 'G4XYZ', snrDb: -11, audioFreqHz: 1420 },
    { direction: 'RX' as const, callsign: 'JA1ABC', snrDb: 4, audioFreqHz: 1850 },
  ];

  // Explicit ft8DxCall picks matching RX SNR & audio offset
  const byDxCall = resolveFt8ReportTarget({
    ft8DxCall: 'JA1ABC',
    ft8Message: 'CQ 26HR001 IO91',
    ft8Log: log,
    myCallsign: '26HR001',
    fallbackAudioFreqHz: 1250,
  });
  assert.deepEqual(byDxCall, {
    dxCall: 'JA1ABC',
    report: '+04',
    message: 'JA1ABC 26HR001 +04',
    audioFreqHz: 1850,
  });

  // Parsed from FT8 input box when ft8DxCall is empty
  const fromMessage = resolveFt8ReportTarget({
    ft8DxCall: '',
    ft8Message: 'G4XYZ 26HR001 IO91',
    ft8Log: log,
    myCallsign: '26HR001',
    fallbackAudioFreqHz: 1250,
  });
  assert.deepEqual(fromMessage, {
    dxCall: 'G4XYZ',
    report: '-11',
    message: 'G4XYZ 26HR001 -11',
    audioFreqHz: 1420,
  });

  // Latest RX fallback when neither ft8DxCall nor message names a DX station
  const fromLog = resolveFt8ReportTarget({
    ft8DxCall: '',
    ft8Message: 'CQ 26HR001 IO91',
    ft8Log: log,
    myCallsign: '26HR001',
    fallbackAudioFreqHz: 1250,
  });
  assert.deepEqual(fromLog, {
    dxCall: 'G4XYZ',
    report: '-11',
    message: 'G4XYZ 26HR001 -11',
    audioFreqHz: 1420,
  });

  // Returns null cleanly when no DX target exists anywhere
  const empty = resolveFt8ReportTarget({
    ft8DxCall: '',
    ft8Message: 'CQ 26HR001 IO91',
    ft8Log: [{ direction: 'TX', callsign: '26HR001', snrDb: 0, audioFreqHz: 1250 }],
    myCallsign: '26HR001',
  });
  assert.equal(empty, null);

  // Recovers target from active tuned station with real SNR when log has no RX rows yet
  const fromStation = resolveFt8ReportTarget({
    ft8DxCall: '',
    ft8Message: 'CQ 26HR001 IO91',
    ft8Log: [],
    myCallsign: '26HR001',
    fallbackAudioFreqHz: 1500,
    activeStations: [
      { callsign: 'ZS1ROM', snrDb: 14, inPassband: true, propagationOpen: true },
    ],
  });
  assert.deepEqual(fromStation, {
    dxCall: 'ZS1ROM',
    report: '+14',
    message: 'ZS1ROM 26HR001 +14',
    audioFreqHz: 1500,
  });
});

test('RTTY fine-tune steps center frequency in exact 10Hz increments and preserves DSP demodulation', () => {
  assert.equal(clampAndStepRttyFineOffset(24), 20);
  assert.equal(clampAndStepRttyFineOffset(-26), -30);
  assert.equal(clampAndStepRttyFineOffset(999), 500);
  assert.equal(clampAndStepRttyFineOffset(-999), -500);
  assert.equal(clampAndStepRttyFineOffset(-0), 0);

  assert.equal(stepRttyFineOffset(0, 1), 10);
  assert.equal(stepRttyFineOffset(10, 2), 30);
  assert.equal(stepRttyFineOffset(30, -5), -20);
  assert.equal(stepRttyFineOffset(500, 1), 500);

  const shifted = getRttyMarkSpaceFreqs({ markHz: 2125, shiftHz: 170, fineOffsetHz: 40 });
  assert.equal(shifted.markHz, 2165);
  assert.equal(shifted.spaceHz, 2335);
  assert.equal(shifted.centerHz, 2250);
  assert.equal(shifted.fineOffsetHz, 40);

  const reversed = getRttyMarkSpaceFreqs({ markHz: 1275, shiftHz: 170, fineOffsetHz: -30, reversePolarity: true });
  assert.equal(reversed.markHz, 1415);
  assert.equal(reversed.spaceHz, 1245);
  assert.equal(reversed.centerHz, 1330);

  const msg = 'RYRY DE 26HR001 K';
  const pcm = synthesizeRttyAudioPcm(msg, 16000, { baudRate: 45.45, shiftHz: 170, markHz: 2125, fineOffsetHz: -70, uos: true });
  const dec = demodulateRttyPcm(pcm, 16000, { baudRate: 45.45, shiftHz: 170, markHz: 2125, fineOffsetHz: -70, uos: true });
  assert.equal(dec.text, msg);
  assert.ok(dec.markSnrRatio > 5);

  const offset = findNearestRttySignalOffsetHz(
    [
      { band: '40m', isTransmitting: true, mode: 'RTTY', freqOffsetHz: 10, propagationOpen: true },
      { band: '20m', isTransmitting: true, mode: 'USB', freqOffsetHz: 25, propagationOpen: true },
      { band: '20m', isTransmitting: true, mode: 'RTTY', freqOffsetHz: -80, propagationOpen: true },
      { band: '20m', isTransmitting: true, mode: 'RTTY', freqOffsetHz: 240, propagationOpen: false },
    ],
    '20m'
  );
  assert.equal(offset, -80);
});

import { HR_COUNTRY_LIST, resolveGridForCallsign, resolvePrefixCountryInfo } from './digitalModes';
import { maidenheadFromLatLon } from './physics';

test('resolveGridForCallsign and HR_COUNTRY_LIST produce geographically accurate Maidenhead grids per country and callsign', () => {
  for (const country of HR_COUNTRY_LIST) {
    const computed = maidenheadFromLatLon(country.defaultQth.lat, country.defaultQth.lon);
    assert.equal(
      country.defaultQth.grid,
      computed,
      `Country ${country.code} (${country.name}) grid ${country.defaultQth.grid} != computed ${computed}`
    );
  }

  assert.equal(getHrCountrySpec('ZA').defaultQth.grid, 'JF96');
  assert.equal(detectCountryFromTimeZone('Africa/Cape_Town'), 'ZA');

  // Registered directory takes priority (ZS1ROM -> Cape Town JF96)
  assert.equal(
    resolveGridForCallsign('zs1rom', [], [{ callsign: 'ZS1ROM', grid: 'JF96' }]),
    'JF96'
  );
  // Regional & country prefix resolution
  assert.equal(resolveGridForCallsign('ZS1ROM'), 'JF96');
  assert.equal(resolveGridForCallsign('ZS5ABC'), 'KG50');
  assert.equal(resolveGridForCallsign('ZS6XYZ'), 'KG43');
  assert.equal(resolveGridForCallsign('26HR001'), 'IO91');
  assert.equal(resolveGridForCallsign('44HR001'), 'JF96');
  assert.equal(resolveGridForCallsign('W1AW'), 'FN31');
  assert.equal(resolveGridForCallsign('K6ABC/P'), 'CM87');
  assert.equal(resolveGridForCallsign('G4XYZ'), 'IO91');
  assert.equal(resolveGridForCallsign('GM4ABC'), 'IO75');
  assert.equal(resolveGridForCallsign('DL2QRP'), 'JO40');
  assert.equal(resolveGridForCallsign('JA1XYZ'), 'PM95');
  assert.equal(resolveGridForCallsign('VK2DX'), 'QF56');
  assert.equal(resolveGridForCallsign('ZL2ABC'), 'RE78');
  assert.equal(resolvePrefixCountryInfo('VE7TEST')?.countryCode, 'CA');
  assert.equal(resolveGridForCallsign('VE7TEST'), 'CN89');
});

test('parseFt8Message handles 3-part directed CQ calls cleanly for replying', () => {
  const dirNoGrid = parseFt8Message('CQ DX ZS1ROM');
  assert.equal(dirNoGrid.isCq, true);
  assert.equal(dirNoGrid.toCall, 'CQ DX');
  assert.equal(dirNoGrid.fromCall, 'ZS1ROM');

  assert.equal(
    canAutoReplyFt8Row({ direction: 'RX', isCq: true, callsign: '', message: 'CQ DX ZS1ROM' }, '26HR001'),
    true
  );
  assert.deepEqual(
    buildFt8AutoReplyPayload({ callsign: '', audioFreqHz: 1400, message: 'CQ DX ZS1ROM' }, '26HR001', 'IO91'),
    { dxCall: 'ZS1ROM', message: 'ZS1ROM 26HR001 IO91', audioFreqHz: 1400 }
  );
});

test('sanitizeFt8DraftInput preserves spaces while typing and buildFt8RowClickDraft advances FT8 QSO stages', () => {
  assert.equal(sanitizeFt8DraftInput('  cq  w1aw '), 'CQ W1AW ');
  assert.equal(sanitizeFt8DraftInput('cq zs1rom!@#$ fn31'), 'CQ ZS1ROM FN31');
  assert.equal(sanitizeFt8DraftInput('A'.repeat(40)).length, 28);

  assert.deepEqual(
    buildFt8RowClickDraft(
      { direction: 'RX', isCq: true, callsign: 'W1AW', snrDb: -6, audioFreqHz: 1450, message: 'CQ W1AW FN31' },
      'ZS1ROM',
      'JF96'
    ),
    { dxCall: 'W1AW', message: 'W1AW ZS1ROM JF96', audioFreqHz: 1450 }
  );

  assert.deepEqual(
    buildFt8RowClickDraft(
      { direction: 'RX', isCq: false, callsign: 'W1AW', snrDb: -6, audioFreqHz: 1450, message: 'ZS1ROM W1AW FN31' },
      'ZS1ROM',
      'JF96'
    ),
    { dxCall: 'W1AW', message: 'W1AW ZS1ROM -06', audioFreqHz: 1450 }
  );

  assert.deepEqual(
    buildFt8RowClickDraft(
      { direction: 'RX', isCq: false, callsign: 'W1AW', snrDb: 4, audioFreqHz: 1450, message: 'ZS1ROM W1AW -09' },
      'ZS1ROM',
      'JF96'
    ),
    { dxCall: 'W1AW', message: 'W1AW ZS1ROM R+04', audioFreqHz: 1450 }
  );

  assert.deepEqual(
    buildFt8RowClickDraft(
      { direction: 'RX', isCq: false, callsign: 'W1AW', snrDb: 4, audioFreqHz: 1450, message: 'ZS1ROM W1AW R+04' },
      'ZS1ROM',
      'JF96'
    ),
    { dxCall: 'W1AW', message: 'W1AW ZS1ROM RR73', audioFreqHz: 1450 }
  );

  assert.deepEqual(
    buildFt8RowClickDraft(
      { direction: 'RX', isCq: false, callsign: 'W1AW', snrDb: 4, audioFreqHz: 1450, message: 'ZS1ROM W1AW RR73' },
      'ZS1ROM',
      'JF96'
    ),
    { dxCall: 'W1AW', message: 'W1AW ZS1ROM 73', audioFreqHz: 1450 }
  );
});

test('JTTY 6-unit JIS Katakana/Latin codec, Romaji converter, and FSK DSP roundtrip work end-to-end', () => {
  assert.equal(romajiToKatakana('TOUKYOU'), 'トウキョウ');
  assert.equal(romajiToKatakana('konnichiwa'), 'コンニチワ');
  assert.equal(sanitizeJttyText('こんにちは DE ja1xyz 599 K'), 'コンニチハ DE JA1XYZ 599 K');
  assert.equal(getStandardJttyFrequency('20m'), 14_088_000);

  const mixed = 'CQ CQ デ JA1XYZ トウキョウ 599 K';
  const words = encodeJttyChars(mixed);
  assert.equal(decodeJttyChars(words), mixed);

  const segs = jttyMarkSpaceTimeline('CQ カナ', { baudRate: 50, shiftHz: 170, markHz: 2125 });
  assert.ok(segs.length > 20);
  assert.ok(jttyDurationMs('CQ カナ', { baudRate: 50 }) > 600);

  const freqs = getJttyMarkSpaceFreqs({ markHz: 1275, shiftHz: 425, fineOffsetHz: 20, reversePolarity: true });
  assert.equal(freqs.markHz, 1720);
  assert.equal(freqs.spaceHz, 1295);

  const pcmStd = synthesizeJttyAudioPcm(mixed, 16000, { baudRate: 50, shiftHz: 170, markHz: 2125 });
  const decStd = demodulateJttyPcm(pcmStd, 16000, { baudRate: 50, shiftHz: 170, markHz: 2125 });
  assert.equal(decStd.text, mixed);
  assert.ok(decStd.markSnrRatio > 5);

  const fastMsg = 'DE ZS1ROM 73 サヨウナラ';
  const fastCfg = { baudRate: 75 as const, shiftHz: 425 as const, markHz: 1275 as const, reversePolarity: true };
  const pcmFast = synthesizeJttyAudioPcm(fastMsg, 16000, fastCfg);
  const decFast = demodulateJttyPcm(pcmFast, 16000, fastCfg);
  assert.equal(decFast.text, fastMsg);
});



