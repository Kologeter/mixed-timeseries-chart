export type SeriesType = 'area' | 'bar' | 'spline' | 'line';
export type MarkerSymbol = 'circle' | 'square' | 'diamond' | 'triangle' | 'triangle-down';

export type XValue = number | string | Date;
export type DataPoint = number | null | [XValue, number | null] | { x: XValue; y: number | null };

export interface MarkerOptions {
  enabled?: boolean;
  symbol?: MarkerSymbol;
  /** Радиус маркера в состоянии покоя. */
  radius?: number;
  /** Радиус маркера при наведении (рисуется с белой обводкой 1px). */
  hoverRadius?: number;
}

export interface SeriesOptions {
  name?: string;
  id?: string;
  type?: SeriesType;
  color?: string;
  data: DataPoint[];
  /** Идентификатор оси Y. Серии с одинаковым yAxis делят одну шкалу. */
  yAxis?: string | number;
  /** Число знаков после запятой в тултипе. По умолчанию значение выводится как есть. */
  valueDecimals?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  lineWidth?: number;
  /** area: прозрачность заливки (0..1). */
  fillOpacity?: number;
  /** area: сглаживать верхнюю кромку (по умолчанию true). */
  smooth?: boolean;
  marker?: MarkerOptions;
  visible?: boolean;
}

export interface TooltipPoint {
  series: { name: string; color: string; type: SeriesType; index: number; id: string };
  x: number | string;
  y: number;
  formatted: string;
}

export interface ChartOptions {
  series: SeriesOptions[];
  spacing?: number;
  backgroundColor?: string;
  plotBorderWidth?: number;
  plotBorderColor?: string;
  tickPixelInterval?: number;
  colors?: string[];
  xAxis?: {
    type?: 'datetime' | 'category' | 'linear';
    dateFormat?: string;
    useUTC?: boolean;
    categories?: string[] | null;
  };
  tooltip?: {
    enabled?: boolean;
    distance?: number;
    hideDelay?: number;
    snap?: number;
    headerFormatter?: ((label: string, points: TooltipPoint[], chart: MixedChart) => string) | null;
    formatter?: ((points: TooltipPoint[], label: string, chart: MixedChart) => string) | null;
  };
  halo?: { size?: number; opacity?: number };
  bar?: {
    width?: number;
    maxWidthRatio?: number;
    borderWidth?: number;
    borderColor?: string;
    borderRadius?: number;
    hoverBrightness?: number;
  };
  hover?: { lineWidthPlus?: number };
}

export declare class MixedChart {
  constructor(container: HTMLElement | string, options: ChartOptions);
  readonly container: HTMLElement;
  readonly svg: SVGSVGElement;
  options: ChartOptions;
  /** Обновить настройки и/или данные (series заменяются целиком). */
  update(options: Partial<ChartOptions>): void;
  /** Заменить данные одной серии по индексу. */
  setSeriesData(index: number, data: DataPoint[]): void;
  /** Перерисовать (например, после ручного изменения размера контейнера). */
  render(): void;
  /** Точки всех серий в слоте index (по оси X). */
  pointsAt(index: number): TooltipPoint[];
  destroy(): void;
}

export declare const DEFAULT_OPTIONS: Required<Omit<ChartOptions, 'series'>> & { series: SeriesOptions[] };
export declare const DEFAULT_COLORS: string[];
export declare function createChart(container: HTMLElement | string, options: ChartOptions): MixedChart;
export declare function parsePoints(data: DataPoint[], xAxis: NonNullable<ChartOptions['xAxis']>): { x: number | string | null; y: number | null }[];
export declare function brighten(color: string, amount: number): string;
export default createChart;
