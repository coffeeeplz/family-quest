import { useEffect, useState } from 'react';
import { useSession } from '../../app/session';
import { APP_VERSION, CHANGELOG, compareVersions } from '../../domain/changelog';
import { formatDay } from '../../lib/dates';
import { markUpdatesSeen, seenVersion } from '../../lib/updates';
import { BackLink } from '../../ui/kit';

/** 업데이트 소식: 버전별로 새로 생긴 기능. 열면 "새 소식" 표시가 사라진다. 부모용 줄은 부모에게만 보인다. */
export function UpdatesPage() {
  const { isParent } = useSession();
  // 열기 전에 본 버전을 기억해 두고, 그 뒤의 소식에 "새로" 표시를 붙인다.
  const [seen] = useState(seenVersion);
  useEffect(() => markUpdatesSeen(), []);

  return (
    <main className="screen">
      <BackLink to="/more" label="더보기" />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">업데이트 소식</h1>
          <p className="t-cap">지금 버전 v{APP_VERSION}</p>
        </div>
      </header>

      {CHANGELOG.map((release) => (
        <section key={release.version} className="card stack" aria-label={`버전 ${release.version}`} style={{ gap: 8 }}>
          <div className="section-head" style={{ alignItems: 'center' }}>
            <h2 className="t-title" style={{ fontSize: 15 }}>
              v{release.version}
            </h2>
            <span className="t-cap">
              {compareVersions(release.version, seen) > 0 && <span className="t-capb new-tag">새로 </span>}
              {formatDay(release.date)}
            </span>
          </div>
          <ul className="update-list">
            {release.items.map((item) => (
              <li key={item} className="t-cap">
                {item}
              </li>
            ))}
            {isParent &&
              release.parentItems?.map((item) => (
                <li key={item} className="t-cap">
                  <span className="t-capb">부모님께 </span>
                  {item}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
