import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, CHANGELOG, compareVersions, releasesSince } from '../src/domain/changelog';

describe('업데이트 소식', () => {
  it('새 버전이 맨 앞에, 번호와 날짜가 차례대로', () => {
    for (let i = 1; i < CHANGELOG.length; i += 1) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
    }
    expect(CHANGELOG.every((r) => /^\d+\.\d+\.\d+$/.test(r.version) && r.items.length > 0)).toBe(true);
  });

  it('package.json 과 CHANGELOG.md 가 앱의 버전과 맞다', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).version).toBe(APP_VERSION);
    const md = readFileSync('CHANGELOG.md', 'utf8');
    for (const release of CHANGELOG) {
      expect(md).toContain(`## v${release.version} (${release.date})`);
      for (const item of release.items) expect(md).toContain(`- ${item}`);
    }
  });

  it('버전 비교와 본 뒤의 소식', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('1.8.0', '1.8.0')).toBe(0);
    expect(releasesSince(APP_VERSION)).toEqual([]);
    expect(releasesSince(CHANGELOG[1].version).map((r) => r.version)).toEqual([APP_VERSION]);
  });
});
