package org.marly.mavigo.service.tourism;

import java.util.ArrayList;
import java.util.List;

public final class RouteCorridorGeometry {

    private static final double COORD_EPS = 1e-6;

    private RouteCorridorGeometry() {
    }

    public static double toRad(double degrees) {
        return degrees * Math.PI / 180.0;
    }

    public static double distanceMetersBetween(double lng1, double lat1, double lng2, double lat2) {
        double avgLatRad = toRad((lat1 + lat2) / 2.0);
        double lngScale = 111_320 * Math.cos(avgLatRad);
        double latScale = 110_540;
        double dx = (lng2 - lng1) * lngScale;
        double dy = (lat2 - lat1) * latScale;
        return Math.hypot(dx, dy);
    }

    public static double distancePointToPolylineMeters(double lng, double lat, List<double[]> lineLngLat) {
        if (lineLngLat.size() <= 1) {
            return lineLngLat.isEmpty() ? Double.POSITIVE_INFINITY
                    : distanceMetersBetween(lng, lat, lineLngLat.getFirst()[0], lineLngLat.getFirst()[1]);
        }
        double best = Double.POSITIVE_INFINITY;
        for (int i = 0; i < lineLngLat.size() - 1; i++) {
            double[] a = lineLngLat.get(i);
            double[] b = lineLngLat.get(i + 1);
            double d = distancePointToSegmentMeters(lng, lat, a[0], a[1], b[0], b[1]);
            if (d < best) {
                best = d;
            }
        }
        return best;
    }

    public static double distancePointToSegmentMeters(double plng, double plat,
            double lng1, double lat1, double lng2, double lat2) {
        double latRad = toRad(plat);
        double lngScale = 111_320 * Math.cos(latRad);
        double latScale = 110_540;

        double px = plng * lngScale;
        double py = plat * latScale;
        double x1 = lng1 * lngScale;
        double y1 = lat1 * latScale;
        double x2 = lng2 * lngScale;
        double y2 = lat2 * latScale;

        double dx = x2 - x1;
        double dy = y2 - y1;
        double segLengthSq = dx * dx + dy * dy;
        if (segLengthSq == 0) {
            return Math.hypot(px - x1, py - y1);
        }

        double t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / segLengthSq));
        double projX = x1 + t * dx;
        double projY = y1 + t * dy;
        return Math.hypot(px - projX, py - projY);
    }

    public static double polylineLengthMeters(List<double[]> coords) {
        double sum = 0;
        for (int i = 0; i < coords.size() - 1; i++) {
            double[] a = coords.get(i);
            double[] b = coords.get(i + 1);
            sum += distanceMetersBetween(a[0], a[1], b[0], b[1]);
        }
        return sum;
    }

    public static double[] pointAtFractionAlong(List<double[]> coords, double fraction) {
        if (coords.isEmpty()) {
            return new double[] { 0, 0 };
        }
        if (coords.size() == 1) {
            double[] single = coords.getFirst();
            return new double[] { single[0], single[1] };
        }

        double f = Math.max(0, Math.min(1, fraction));
        double total = polylineLengthMeters(coords);
        if (!(total > 1e-3)) {
            double[] first = coords.getFirst();
            return new double[] { first[0], first[1] };
        }

        double remaining = f * total;
        for (int i = 0; i < coords.size() - 1; i++) {
            double[] a = coords.get(i);
            double[] b = coords.get(i + 1);
            double segLen = distanceMetersBetween(a[0], a[1], b[0], b[1]);
            if (remaining <= segLen + 1e-6) {
                double t = segLen > 0 ? remaining / segLen : 0;
                return new double[] {
                        a[0] + t * (b[0] - a[0]),
                        a[1] + t * (b[1] - a[1])
                };
            }
            remaining -= segLen;
        }
        double[] last = coords.get(coords.size() - 1);
        return new double[] { last[0], last[1] };
    }

    public static List<double[]> sampleCentersAlongLine(List<double[]> lineLngLat,
            double spacingMeters,
            int maxPoints) {
        List<double[]> centers = new ArrayList<>();
        if (lineLngLat.size() <= 1) {
            if (lineLngLat.size() == 1) {
                centers.add(new double[] { lineLngLat.getFirst()[0], lineLngLat.getFirst()[1] });
            }
            return centers;
        }
        double totalLength = polylineLengthMeters(lineLngLat);
        if (!(totalLength > 1e-3)) {
            double[] p = lineLngLat.getFirst();
            centers.add(new double[] { p[0], p[1] });
            return centers;
        }

        int estimatedCount = Math.max(1, (int) Math.ceil(totalLength / spacingMeters));
        int n = Math.min(maxPoints, estimatedCount);

        if (n == 1) {
            double[] pt = pointAtFractionAlong(lineLngLat, 0.5);
            centers.add(pt);
            return centers;
        }
        for (int i = 0; i < n; i++) {
            centers.add(pointAtFractionAlong(lineLngLat, i / (double) (n - 1)));
        }
        return centers;
    }

    public static List<double[]> lineFromOrderedPoints(List<JourneyGeomPoint> points) {
        List<double[]> out = new ArrayList<>();
        JourneyGeomPoint prev = null;
        for (JourneyGeomPoint p : points) {
            if (p.longitude() == null || p.latitude() == null
                    || p.longitude().isNaN() || p.latitude().isNaN()) {
                continue;
            }
            JourneyGeomPoint here = new JourneyGeomPoint(p.longitude(), p.latitude());
            if (prev != null) {
                if (Math.abs(here.longitude() - prev.longitude()) < COORD_EPS
                        && Math.abs(here.latitude() - prev.latitude()) < COORD_EPS) {
                    continue;
                }
            }
            out.add(new double[] { here.longitude(), here.latitude() });
            prev = here;
        }
        return out;
    }

    public record JourneyGeomPoint(Double longitude, Double latitude) {
    }
}
