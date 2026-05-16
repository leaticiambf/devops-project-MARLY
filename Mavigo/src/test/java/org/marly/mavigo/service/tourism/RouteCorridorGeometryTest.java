package org.marly.mavigo.service.tourism;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.marly.mavigo.service.tourism.RouteCorridorGeometry.JourneyGeomPoint;

class RouteCorridorGeometryTest {

    @Test
    void distancePointToPolyline_handlesEmptySingleAndSegmentLines() {
        assertEquals(Double.POSITIVE_INFINITY,
                RouteCorridorGeometry.distancePointToPolylineMeters(2.0, 48.0, List.of()));

        double singlePointDistance = RouteCorridorGeometry.distancePointToPolylineMeters(
                2.0001, 48.0, List.of(new double[] { 2.0, 48.0 }));
        assertTrue(singlePointDistance > 7.0 && singlePointDistance < 8.0);

        double segmentDistance = RouteCorridorGeometry.distancePointToPolylineMeters(
                2.005, 48.001, List.of(new double[] { 2.0, 48.0 }, new double[] { 2.01, 48.0 }));
        assertTrue(segmentDistance > 100.0 && segmentDistance < 112.0);
    }

    @Test
    void pointAtFractionAlong_clampsAndInterpolates() {
        List<double[]> line = List.of(new double[] { 2.0, 48.0 }, new double[] { 2.02, 48.0 });

        assertArrayEquals(new double[] { 2.0, 48.0 },
                RouteCorridorGeometry.pointAtFractionAlong(line, -1.0), 1e-9);
        assertArrayEquals(new double[] { 2.01, 48.0 },
                RouteCorridorGeometry.pointAtFractionAlong(line, 0.5), 1e-6);
        assertArrayEquals(new double[] { 2.02, 48.0 },
                RouteCorridorGeometry.pointAtFractionAlong(line, 2.0), 1e-9);
    }

    @Test
    void sampleCentersAlongLine_respectsSingleDegenerateAndMaximumCases() {
        assertEquals(0, RouteCorridorGeometry.sampleCentersAlongLine(List.of(), 100.0, 3).size());

        List<double[]> single = RouteCorridorGeometry.sampleCentersAlongLine(
                List.of(new double[] { 2.0, 48.0 }), 100.0, 3);
        assertArrayEquals(new double[] { 2.0, 48.0 }, single.getFirst(), 1e-9);

        List<double[]> degenerate = RouteCorridorGeometry.sampleCentersAlongLine(
                List.of(new double[] { 2.0, 48.0 }, new double[] { 2.0, 48.0 }), 100.0, 3);
        assertEquals(1, degenerate.size());

        List<double[]> sampled = RouteCorridorGeometry.sampleCentersAlongLine(
                List.of(new double[] { 2.0, 48.0 }, new double[] { 2.05, 48.0 }), 500.0, 4);
        assertEquals(4, sampled.size());
        assertArrayEquals(new double[] { 2.0, 48.0 }, sampled.getFirst(), 1e-9);
        assertArrayEquals(new double[] { 2.05, 48.0 }, sampled.getLast(), 1e-9);
    }

    @Test
    void lineFromOrderedPoints_skipsInvalidAndDuplicateCoordinates() {
        List<double[]> line = RouteCorridorGeometry.lineFromOrderedPoints(List.of(
                new JourneyGeomPoint(null, 48.0),
                new JourneyGeomPoint(Double.NaN, 48.0),
                new JourneyGeomPoint(2.0, 48.0),
                new JourneyGeomPoint(2.0 + 1e-7, 48.0 + 1e-7),
                new JourneyGeomPoint(2.01, 48.01)));

        assertEquals(2, line.size());
        assertArrayEquals(new double[] { 2.0, 48.0 }, line.getFirst(), 1e-9);
        assertArrayEquals(new double[] { 2.01, 48.01 }, line.getLast(), 1e-9);
    }
}
