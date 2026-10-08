import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import { DEFAULT_PUSH_PREFS, PUSH_TYPE_LABELS, isTime, type PushPrefs } from '../../domain/push';
import { BackLink, Button, Field } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { usePushStatus } from './usePush';

/** 상태마다 보여 줄 안내 */
const STATUS_TEXT = {
  demo: '체험 모드에서는 알림이 오지 않아요. 설정을 바꿔 보는 것만 할 수 있어요.',
  unsupported: '이 브라우저에서는 알림을 받을 수 없어요. 안드로이드는 크롬에서, 아이폰은 홈 화면에 추가한 앱에서 켤 수 있어요.',
  denied: '알림이 막혀 있어요. 휴대폰 설정에서 이 앱(또는 크롬)의 알림을 허용한 뒤 다시 와 주세요.',
  off: '이 기기에서는 아직 알림이 꺼져 있어요.',
  on: '이 기기에서 알림을 받고 있어요.',
} as const;

/** 더보기 > 알림: 이 기기에서 알림을 켜고, 받을 종류와 시각을 정한다. */
export function NotifyPage() {
  const backend = useBackend();
  const { family, me } = useSession();
  const { status, reload } = usePushStatus();
  const { busy, run } = useAction();
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PUSH_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(
    () =>
      backend.watchPushPrefs(
        family.id,
        me.uid,
        (next) => {
          // 처음 한 번만 화면에 채운다(고치는 중에 덮어쓰지 않게).
          setLoaded((was) => {
            if (!was) setPrefs(next);
            return true;
          });
        },
        () => setLoaded(true),
      ),
    [backend, family.id, me.uid],
  );

  const kinds = PUSH_TYPE_LABELS[me.role];
  const toggle = (type: keyof PushPrefs['types']) => setPrefs({ ...prefs, types: { ...prefs.types, [type]: !prefs.types[type] } });
  const setTime = (key: 'quietStart' | 'quietEnd' | 'remindAt' | 'morningAt', value: string) => setPrefs({ ...prefs, [key]: value });

  async function save() {
    setError('');
    const times = [prefs.quietStart, prefs.quietEnd, prefs.morningAt, ...(me.role === 'child' ? [prefs.remindAt] : [])];
    if (!times.every(isTime)) {
      setError('시각을 모두 정해 주세요.');
      return;
    }
    await run(() => backend.savePushPrefs(family.id, me.uid, prefs), '알림 설정을 저장했어요.');
  }

  return (
    <main className="screen">
      <BackLink />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">알림</h1>
          <p className="t-cap">이 휴대폰으로 받을 알림을 정해요</p>
        </div>
      </header>

      <section className="px stack notify-box" aria-label="이 기기의 알림" style={{ gap: 12 }}>
        {status === null && <p className="t-cap">알림 상태를 살피는 중...</p>}
        {status === 'install' ? (
          <>
            <p className="t-capb">아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.</p>
            <ol className="t-body notify-steps">
              <li>사파리 아래쪽의 공유 버튼(네모에 위쪽 화살표)을 눌러요.</li>
              <li>"홈 화면에 추가"를 눌러요.</li>
              <li>홈 화면에 생긴 "가족 퀘스트" 아이콘으로 앱을 열어요.</li>
              <li>더보기 &gt; 알림에서 "이 기기에서 알림 받기"를 눌러요.</li>
            </ol>
          </>
        ) : (
          status && <p className={status === 'on' ? 't-capb' : 't-cap'}>{STATUS_TEXT[status]}</p>
        )}
        {status === 'off' && (
          <Button
            tone="mint"
            big
            block
            disabled={busy}
            onClick={() => void run(() => backend.enablePush(family.id, me.uid), '알림을 켰어요!').then(reload)}
          >
            이 기기에서 알림 받기
          </Button>
        )}
        {status === 'on' && (
          <Button tone="plain" block disabled={busy} onClick={() => void run(() => backend.disablePush(family.id, me.uid), '이 기기의 알림을 껐어요.').then(reload)}>
            이 기기 알림 끄기
          </Button>
        )}
        <p className="t-cap" style={{ lineHeight: '18px' }}>
          다른 휴대폰이나 태블릿에서도 받으려면 그 기기에서 한 번 더 켜 주세요. 앱을 보고 있는 동안에도 알림이 올 수 있어요.
        </p>
      </section>

      <section className="stack" aria-label="받을 알림" style={{ gap: 10 }}>
        <h2 className="t-title">받을 알림</h2>
        {kinds.map((kind) => (
          <button
            key={kind.type}
            type="button"
            className="px list-button menu-row notify-row"
            aria-pressed={prefs.types[kind.type]}
            aria-label={`${kind.label} 알림 ${prefs.types[kind.type] ? '켜짐' : '꺼짐'}`}
            onClick={() => toggle(kind.type)}
          >
            <span className="card-main">
              <span className="t-body item-title">{kind.label}</span>
              <span className="t-cap">{kind.hint}</span>
            </span>
            <span className={prefs.types[kind.type] ? 'chip-like on' : 'chip-like'} aria-hidden="true">
              {prefs.types[kind.type] ? '켜짐' : '꺼짐'}
            </span>
          </button>
        ))}
      </section>

      <section className="stack" aria-label="알림 시각" style={{ gap: 12 }}>
        <h2 className="t-title">시각</h2>
        <div className="field">
          <div className="label">조용한 시간 (이때는 알림을 보내지 않아요)</div>
          <div className="row" style={{ gap: 10 }}>
            <input className="input grow" type="time" aria-label="조용한 시간 시작" value={prefs.quietStart} onChange={(e) => setTime('quietStart', e.target.value)} />
            <span className="t-body">~</span>
            <input className="input grow" type="time" aria-label="조용한 시간 끝" value={prefs.quietEnd} onChange={(e) => setTime('quietEnd', e.target.value)} />
          </div>
          <p className="t-cap">시작과 끝을 같게 하면 조용한 시간 없이 늘 받아요.</p>
        </div>
        {me.role === 'child' && (
          <Field label="저녁 할 일 알림 시각" hint='아직 안 한 "꼭" 할 일이 있으면 이 시각에 알려 줘요.'>
            {(id) => <input id={id} className="input" type="time" value={prefs.remindAt} onChange={(e) => setTime('remindAt', e.target.value)} />}
          </Field>
        )}
        <Field label="아침 일정 알림 시각" hint="오늘 일정이 있으면 이 시각에 알려 줘요.">
          {(id) => <input id={id} className="input" type="time" value={prefs.morningAt} onChange={(e) => setTime('morningAt', e.target.value)} />}
        </Field>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button big block disabled={busy || !loaded} onClick={() => void save()}>
        알림 설정 저장하기
      </Button>
    </main>
  );
}
