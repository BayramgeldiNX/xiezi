// Compare what speech recognition heard with the target text.
export const clean = (s) => s.replace(/[\s，。！？、,.!?：:；;“”"'（）()A-Z]/gi, "");

// Share of the target's characters heard, in order (longest common subsequence).
export function overlap(target, heard) {
  const a = [...clean(target)], b = [...clean(heard)];
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return a.length ? dp[a.length][b.length] / a.length : 0;
}
