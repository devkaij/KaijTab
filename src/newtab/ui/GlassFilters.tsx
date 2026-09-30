/**
 * 玻璃材质用到的 SVG 滤镜定义（挂载一次即可）。
 * 液态玻璃的"折射"：用分形噪声生成位移场，再通过 feDisplacementMap 让背景像素发生弯曲。
 * 说明：backdrop-filter 引用 SVG 滤镜目前只有 Chromium 支持 —— 我们的目标就是 Edge/Chrome。
 */
export function GlassFilters() {
  return (
    <svg class="kt-svg-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="kt-liquid-refraction">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.011"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="4" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="12"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
