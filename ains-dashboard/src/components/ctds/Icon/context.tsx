"use client";

/**
 * Icon 축 컨텍스트.
 *
 * Icon 컴포넌트가 프로젝트 내 어디에서 렌더링되든 현재 축 값(family/weight)을
 * 참조할 수 있게 해준다. 프로젝트에서는 앱 루트에서 <IconAxisProvider>로 감싸고,
 * 축이 바뀔 때 value만 갈아끼우면 됨.
 *
 * Icon 라이브러리는 컴포넌트별 MutationObserver 대신 이 컨텍스트로 축을 소비 —
 * O(N)개 관찰자 → 0개.
 */

import { createContext, useContext } from "react";

/** Icon 라이브러리는 앱 코드에 의존하지 않도록 축 타입을 자체 선언한다.
 *  값은 app/data.ts의 IconFamily/IconWeight와 동일해야 함. */
export type IconAxisFamily = "phosphor" | "solar" | "lucide";
export type IconAxisWeight = "regular" | "fill";
export type IconAxis = { family: IconAxisFamily; weight: IconAxisWeight };

export const IconAxisContext = createContext<IconAxis>({
  family: "phosphor",
  weight: "regular",
});

export function IconAxisProvider({
  value,
  children,
}: {
  value: IconAxis;
  children: React.ReactNode;
}) {
  return <IconAxisContext.Provider value={value}>{children}</IconAxisContext.Provider>;
}

export function useIconAxis(): IconAxis {
  return useContext(IconAxisContext);
}
