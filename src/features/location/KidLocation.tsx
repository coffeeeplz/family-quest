import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { LocationRecord, Member } from '../../backend/types';
import {
  DEFAULT_PLACE_RADIUS,
  FAMILY_LINK_URL,
  LOCATION_KEEP_DAYS,
  MAX_PLACES,
  MAX_PLACE_NAME,
  PLACE_RADIUS_CHOICES,
  TRIGGER_LABEL,
  accuracyLabel,
  mapLinks,
  placeLabel,
  timeAgo,
} from '../../domain/location';
import { formatWhen } from '../../lib/dates';
import { Icon } from '../../ui/Sprite';
import { Button, Field, FieldGroup, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { useLocations } from './useLocation';

/** 지난 기록은 처음에 이만큼만 보여 준다. */
const HISTORY_PREVIEW = 4;
const QUICK_NAMES = ['집', '학교', '학원', '할머니 댁'];

/** 부모가 보는 자녀의 위치: 마지막으로 전해진 곳, 지난 기록, 패밀리 링크 바로가기 */
export function KidLocation({ kid }: { kid: Member }) {
  const { today } = useFamilyData();
  const { isParent } = useSession();
  const { records, places, failed } = useLocations();
  const [naming, setNaming] = useState<LocationRecord | null>(null);
  const [showAll, setShowAll] = useState(false);

  const mine = records.filter((record) => record.uid === kid.uid);
  const latest = mine[0] ?? null;
  const history = showAll ? mine.slice(1) : mine.slice(1, 1 + HISTORY_PREVIEW);
  const when = (record: LocationRecord) => timeAgo(record.at) ?? formatWhen(record.at, today);
  const latestLabel = latest ? placeLabel(places, latest) : null;
  const latestLinks = latest ? mapLinks(latest, kid.displayName) : null;

  return (
    <section className="stack" aria-label="위치">
      <div className="section-head">
        <h2 className="t-title">위치</h2>
        <span className="t-cap">최근 {LOCATION_KEEP_DAYS}일</span>
      </div>

      {failed && (
        <p className="px note t-capb" role="alert" style={{ lineHeight: '18px' }}>
          위치 기록을 불러오지 못했어요. Firebase 규칙을 새로 게시했는지 확인해 주세요.
        </p>
      )}

      {latest && latestLinks ? (
        <article className="card">
          <div className="card-row">
            <Icon name="pin" size={36} />
            <div className="card-main">
              <h3 className="t-body item-title">{latestLabel ?? '등록한 장소가 아니에요'}</h3>
              <p className="t-cap">
                {when(latest)} · {TRIGGER_LABEL[latest.trigger]}
              </p>
              {accuracyLabel(latest.accuracy) && <p className="t-cap">{accuracyLabel(latest.accuracy)}</p>}
            </div>
          </div>
          <div className="chips card-foot">
            <a className="chip" href={latestLinks.google} target="_blank" rel="noopener noreferrer">
              구글 지도
            </a>
            <a className="chip" href={latestLinks.kakao} target="_blank" rel="noopener noreferrer">
              카카오맵
            </a>
            {isParent && !latestLabel && places.length < MAX_PLACES && (
              <button type="button" className="chip" onClick={() => setNaming(latest)}>
                이름 붙이기
              </button>
            )}
          </div>
        </article>
      ) : (
        !failed && (
          <p className="t-cap" style={{ lineHeight: '18px' }}>
            아직 위치 기록이 없어요. {kid.displayName}의 앱에서 "지금 여기예요"를 누르면 나타나요.
          </p>
        )
      )}

      {history.map((record) => (
        <div key={record.id} className="px history-row">
          <div className="grow stack" style={{ gap: 4 }}>
            <span className="t-body item-title">{placeLabel(places, record) ?? '등록한 장소가 아니에요'}</span>
            <span className="t-cap">
              {when(record)} · {TRIGGER_LABEL[record.trigger]}
            </span>
          </div>
          <a
            className="link"
            href={mapLinks(record, kid.displayName).google}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${when(record)} 위치를 지도에서 보기`}
          >
            지도
          </a>
        </div>
      ))}
      {mine.length > 1 + HISTORY_PREVIEW && (
        <Button tone="plain" block onClick={() => setShowAll(!showAll)}>
          {showAll ? '지난 기록 접기' : `지난 기록 ${mine.length - 1}개 모두 보기`}
        </Button>
      )}

      <a className="btn plain big block" href={FAMILY_LINK_URL} target="_blank" rel="noopener noreferrer">
        패밀리 링크로 실시간 위치 보기
      </a>

      {naming && <PlaceSheet record={naming} onClose={() => setNaming(null)} />}
    </section>
  );
}

/** 위치 기록에 이름을 붙여 장소로 등록한다. 다음부터는 그 근처에서 온 기록에 이름이 보인다. */
function PlaceSheet({ record, onClose }: { record: LocationRecord; onClose: () => void }) {
  const backend = useBackend();
  const { family, me } = useSession();
  const { busy, run } = useAction();
  const [name, setName] = useState('');
  const [radius, setRadius] = useState(DEFAULT_PLACE_RADIUS);

  async function save() {
    const ok = await run(
      () => backend.createPlace(family.id, { name, lat: record.lat, lng: record.lng, radius }, me.uid),
      '장소를 등록했어요.',
    );
    if (ok) onClose();
  }

  return (
    <Sheet title="이 위치에 이름 붙이기" onClose={onClose}>
      <p className="t-body">이름을 붙여 두면 다음부터 이 근처에서 온 위치가 그 이름으로 보여요.</p>
      <Field label="장소 이름">
        {(id) => (
          <>
            <div className="chips">
              {QUICK_NAMES.map((quick) => (
                <button key={quick} type="button" className="chip" aria-pressed={name === quick} onClick={() => setName(quick)}>
                  {quick}
                </button>
              ))}
            </div>
            <input id={id} className="input" type="text" value={name} maxLength={MAX_PLACE_NAME} onChange={(event) => setName(event.target.value)} />
          </>
        )}
      </Field>
      <FieldGroup label="어디까지를 이 장소로 볼까요?">
        <div className="chips">
          {PLACE_RADIUS_CHOICES.map((meters) => (
            <button key={meters} type="button" role="radio" className="chip" aria-checked={radius === meters} onClick={() => setRadius(meters)}>
              {meters}m
            </button>
          ))}
        </div>
        <p className="t-cap">건물 안에서는 위치가 조금 어긋나므로 넉넉하게 잡는 편이 좋아요.</p>
      </FieldGroup>
      <Button big block disabled={busy} onClick={() => void save()}>
        장소 등록하기
      </Button>
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
