import type { ElementType, ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  greetingNamePaintStyle,
  type GreetingNameColor,
} from '@/lib/greetingNameColor';

function GreetingNamePaint({
  color,
  children,
}: {
  color: GreetingNameColor;
  children?: ReactNode;
}) {
  return (
    <span className="member-greeting-name" style={greetingNamePaintStyle(color)}>
      {children}
    </span>
  );
}

export default function MemberGreeting({
  name,
  color,
  as: Tag = 'p',
  className,
}: {
  name: string;
  color: GreetingNameColor;
  as?: ElementType;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Tag className={className}>
      <Trans
        i18nKey="discover.homeHello"
        t={t}
        values={{ name }}
        components={{ name: <GreetingNamePaint color={color} /> }}
      />
    </Tag>
  );
}
