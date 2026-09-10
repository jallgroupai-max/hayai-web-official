// Superficie de Three.js que usa el sitio. esbuild hace tree-shaking a partir de
// esta lista, por eso el bundle vendorizado pesa una fraccion de three.module.min.js.
// Anadir un simbolo aqui es lo unico necesario para poder importarlo desde /src.
export {
  WebGLRenderer,
  WebGLRenderTarget,
  Scene,
  PerspectiveCamera,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  CanvasTexture,
  Color,
  Vector2,
  Vector3,
  Clock,
  MathUtils,
  SRGBColorSpace,
  LinearFilter,
  LinearMipmapLinearFilter,
  ClampToEdgeWrapping,
  NearestFilter,
  DoubleSide,
  FrontSide
} from 'three';
