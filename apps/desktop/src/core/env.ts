// 환경(Environment) 선택 로직. 같은 baseURL을 가진 환경이 여러 개여도 이름으로 구분한다.

export interface EnvLike {
  name: string;
  baseURL: string;
}

/** 활성 환경 찾기: 이름 우선 매칭, 없으면 baseURL 매칭(하위 호환·이름 미지정 시). */
export function findActiveEnv<T extends EnvLike>(
  envs: T[],
  activeEnvName: string,
  baseURL: string,
): T | undefined {
  if (activeEnvName) {
    const byName = envs.find((e) => e.name === activeEnvName);
    if (byName) return byName;
  }
  return envs.find((e) => e.baseURL === baseURL);
}
