import type { ProfileInput } from '../../backend/types';
import { MAX_NAME } from '../../domain/profile';
import { AVATARS, AVATAR_COLORS, avatarDef } from '../../lib/sprites';
import { Avatar, AvatarFrame } from '../../ui/Sprite';
import { Field, FieldGroup } from '../../ui/kit';

interface Props {
  value: ProfileInput;
  onChange: (next: ProfileInput) => void;
}

/** 이름, 캐릭터, 색을 고르는 입력 묶음. 가입할 때와 프로필을 바꿀 때 함께 쓴다. */
export function ProfileForm({ value, onChange }: Props) {
  const current = avatarDef(value.avatar.id);
  return (
    <>
      <div className="row" style={{ gap: 18 }}>
        <AvatarFrame avatar={value.avatar} size={96} background="var(--pink-soft)" />
        <div className="grow stack" style={{ gap: 10 }}>
          <div className="t-title">{current.name}</div>
          <p className="t-cap">캐릭터와 색은 나중에 언제든 바꿀 수 있어요.</p>
        </div>
      </div>

      <FieldGroup label="캐릭터 고르기">
        <div className="avatar-grid">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              role="radio"
              className="avatar-cell"
              aria-label={avatar.name}
              aria-checked={avatar.id === value.avatar.id}
              // 캐릭터를 바꾸면 그 캐릭터의 기본 색으로 맞춘다.
              onClick={() => onChange({ ...value, avatar: { id: avatar.id, color: avatar.color } })}
            >
              <Avatar avatar={{ id: avatar.id, color: avatar.id === value.avatar.id ? value.avatar.color : avatar.color }} size={48} />
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="색 고르기">
        <div className="swatches">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              role="radio"
              className="swatch"
              aria-label={color.name}
              aria-checked={color.id === value.avatar.color}
              style={{ background: color.hex }}
              onClick={() => onChange({ ...value, avatar: { ...value.avatar, color: color.id } })}
            />
          ))}
        </div>
      </FieldGroup>

      <Field label="이름">
        {(id) => (
          <input
            id={id}
            className="input"
            type="text"
            value={value.displayName}
            maxLength={MAX_NAME}
            placeholder="가족이 부르는 이름"
            autoComplete="nickname"
            onChange={(event) => onChange({ ...value, displayName: event.target.value })}
          />
        )}
      </Field>
    </>
  );
}
