import XCTest
@testable import Timia

final class WorkoutSyncRunTests: XCTestCase {
    func testEmptyWorkoutRunIsNotKeptInHistory() throws {
        let empty = try decodeRun(workoutCount: 0, routeCount: 0, upserted: 0)
        let withWorkouts = try decodeRun(workoutCount: 1, routeCount: 0, upserted: 1)
        let withUpsertOnly = try decodeRun(workoutCount: 0, routeCount: 0, upserted: 2)

        XCTAssertFalse(empty.hasSyncedWorkoutData)
        XCTAssertTrue(withWorkouts.hasSyncedWorkoutData)
        XCTAssertTrue(withUpsertOnly.hasSyncedWorkoutData)
    }

    func testTrainingRecordTimeUsesFromToRangeOnSameDay() throws {
        let run = try decodeRun(
            workoutCount: 1,
            routeCount: 1,
            upserted: 1,
            fromAt: "2026-09-17T10:00:00Z",
            toAt: "2026-09-17T11:30:00Z",
            finishedAt: "2026-09-18T01:00:00Z"
        )

        XCTAssertNotNil(run.trainingRecordTimeLabel)
        XCTAssertTrue(run.trainingRecordTimeLabel?.contains("–") == true)
        XCTAssertFalse(run.syncTimeLabel.isEmpty)
    }

    func testTrainingRecordTimeHiddenWhenNoWorkoutPayload() throws {
        let run = try decodeRun(workoutCount: 0, routeCount: 0, upserted: 3)
        XCTAssertNil(run.trainingRecordTimeLabel)
    }

    @MainActor
    func testWorkoutTimeRangeUsesEarliestStartAndLatestEnd() {
        let workouts = [
            HealthWorkoutPayload(
                hkUuid: "a",
                activityType: "running",
                activityTypeRaw: nil,
                startAt: "2026-09-17T12:00:00Z",
                endAt: "2026-09-17T12:30:00Z",
                durationSeconds: 1800,
                activeEnergyKcal: nil,
                distanceM: nil,
                avgHrBpm: nil,
                maxHrBpm: nil,
                avgCadenceSpm: nil,
                avgPaceSecPerKm: nil,
                elevationAscendedM: nil,
                elevationDescendedM: nil,
                weatherTempC: nil,
                weatherHumidity: nil,
                locationCountry: nil,
                locationAdmin: nil,
                locationCity: nil,
                sourceBundleId: nil,
                sourceName: nil
            ),
            HealthWorkoutPayload(
                hkUuid: "b",
                activityType: "cycling",
                activityTypeRaw: nil,
                startAt: "2026-09-17T09:00:00Z",
                endAt: "2026-09-17T14:00:00Z",
                durationSeconds: 18000,
                activeEnergyKcal: nil,
                distanceM: nil,
                avgHrBpm: nil,
                maxHrBpm: nil,
                avgCadenceSpm: nil,
                avgPaceSecPerKm: nil,
                elevationAscendedM: nil,
                elevationDescendedM: nil,
                weatherTempC: nil,
                weatherHumidity: nil,
                locationCountry: nil,
                locationAdmin: nil,
                locationCity: nil,
                sourceBundleId: nil,
                sourceName: nil
            )
        ]

        let range = WorkoutSyncService.workoutTimeRange(workouts)
        XCTAssertEqual(range?.start, HealthSyncService.parseISO("2026-09-17T09:00:00Z"))
        XCTAssertEqual(range?.end, HealthSyncService.parseISO("2026-09-17T14:00:00Z"))
        XCTAssertNil(WorkoutSyncService.workoutTimeRange([]))
    }

    private func decodeRun(
        workoutCount: Int,
        routeCount: Int,
        upserted: Int,
        fromAt: String? = nil,
        toAt: String? = "2026-09-18T01:00:00Z",
        finishedAt: String? = "2026-09-18T01:00:00Z"
    ) throws -> HealthSyncRun {
        var fields: [String] = [
            #""id": "run-1""#,
            #""source": "background""#,
            #""status": "success""#,
            #""pipeline": "workout""#,
            #""started_at": "2026-09-18T01:00:00Z""#,
            #""quantity_count": 0"#,
            #""sleep_count": 0"#,
            #""stand_hour_count": 0"#,
            #""heartbeat_series_count": 0"#,
            #""workout_count": \#(workoutCount)"#,
            #""route_count": \#(routeCount)"#,
            #""upserted": \#(upserted)"#,
            #""local_dates": []"#
        ]
        if let finishedAt {
            fields.append(#""finished_at": "\#(finishedAt)""#)
        } else {
            fields.append(#""finished_at": null"#)
        }
        if let fromAt {
            fields.append(#""from_at": "\#(fromAt)""#)
        } else {
            fields.append(#""from_at": null"#)
        }
        if let toAt {
            fields.append(#""to_at": "\#(toAt)""#)
        } else {
            fields.append(#""to_at": null"#)
        }
        let json = "{\n" + fields.joined(separator: ",\n") + "\n}"
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(HealthSyncRun.self, from: Data(json.utf8))
    }
}
