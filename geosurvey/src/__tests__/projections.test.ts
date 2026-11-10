import { resolveCrs, transverseMercator, utmZone, type CrsId } from '../core/projections';

/** Valeurs de référence calculées avec PROJ 9 (pyproj), lon/lat WGS 84 -> x/y. */
const REFERENCE: [number, number, number, number, number][] = [
  [26191, -1.9086, 34.6814, 819721.8902, 458828.3421],
  [26191, -7.5898, 33.5731, 296628.4642, 332701.6822],
  [26191, -5.834, 35.7595, 460580.2948, 573193.2962],
  [26191, -9.5981, 30.4278, 96299.0744, -10088.6221],
  [26192, -1.9086, 34.6814, 820864.5623, 858000.5234],
  [26192, -7.5898, 33.5731, 296160.0494, 731816.3496],
  [26192, -9.5981, 30.4278, 96748.6915, 388236.5727],
  [26192, -13.2, 27.15, -273185.4505, 43755.168],
  [3857, -1.9086, 34.6814, -212464.3801, 4120668.5258],
  [3857, -13.2, 27.15, -1469417.2785, 3142224.7988],
];

const UTM_REFERENCE: [number, boolean, number, number, number, number][] = [
  [29, false, -1.9086, 34.6814, 1150187.771, 3860677.0574],
  [29, false, -7.5898, 33.5731, 630881.9261, 3715714.606],
  [29, false, -13.2, 27.15, 83631.4556, 3010021.2489],
  [30, false, -1.9086, 34.6814, 599978.6848, 3838254.3293],
  [30, false, -5.834, 35.7595, 243771.6473, 3960978.9525],
  [33, true, 13.2344, -8.8383, 305820.9736, 9022565.0478],
  [31, false, 2.3522, 48.8566, 452482.5327, 5411717.1769],
];

describe('projections', () => {
  it.each(REFERENCE)('EPSG:%i (%f, %f) correspond à PROJ', (epsg, lon, lat, x, y) => {
    const crs = resolveCrs(`EPSG:${epsg}` as CrsId);
    const [px, py] = crs.forward(lon, lat);
    expect(Math.abs(px - x)).toBeLessThan(0.01);
    expect(Math.abs(py - y)).toBeLessThan(0.01);
  });

  it.each(UTM_REFERENCE)('UTM %i (sud=%s) (%f, %f) correspond à PROJ', (zone, south, lon, lat, x, y) => {
    const [px, py] = transverseMercator(lon, lat, {
      lon0: zone * 6 - 183,
      k0: 0.9996,
      x0: 500000,
      y0: south ? 10000000 : 0,
    });
    expect(Math.abs(px - x)).toBeLessThan(0.001);
    expect(Math.abs(py - y)).toBeLessThan(0.001);
  });

  it('choisit la zone UTM à partir des données', () => {
    expect(utmZone(-1.9)).toBe(30);
    expect(utmZone(-7.6)).toBe(29);
    expect(utmZone(180)).toBe(60);
    const oujda = resolveCrs('UTM', [[-1.9086, 34.6814]]);
    expect(oujda.epsg).toBe(32630);
    expect(oujda.prj).toContain('WGS_1984_UTM_Zone_30N');
    expect(oujda.prj).toContain('PARAMETER["Central_Meridian",-3.0]');
    expect(resolveCrs('UTM', [[13.2, -8.8]]).epsg).toBe(32733);
  });

  it('WGS 84 est l’identité', () => {
    const crs = resolveCrs('EPSG:4326');
    expect(crs.geographic).toBe(true);
    expect(crs.forward(-1.5, 34.2)).toEqual([-1.5, 34.2]);
  });
});
