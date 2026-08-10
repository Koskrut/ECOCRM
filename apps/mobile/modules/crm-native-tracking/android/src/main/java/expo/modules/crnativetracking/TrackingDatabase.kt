package expo.modules.crnativetracking

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

/** B2 — local-first persistence before network upload. */
@Entity(tableName = "tracking_samples")
data class TrackingSampleEntity(
  @PrimaryKey val sampleId: String,
  val shiftId: String,
  val lat: Double,
  val lng: Double,
  val accuracyM: Double,
  val clientRecordedAt: String,
  val uploadState: String,
  val attemptCount: Int,
  val nextRetryAt: String,
)

@Dao
interface TrackingSampleDao {
  @Insert(onConflict = OnConflictStrategy.ABORT)
  suspend fun insert(sample: TrackingSampleEntity)

  @Query(
    "SELECT * FROM tracking_samples WHERE uploadState = 'PENDING' AND nextRetryAt <= :nowIso ORDER BY clientRecordedAt ASC LIMIT :limit",
  )
  suspend fun pendingReady(nowIso: String, limit: Int = 50): List<TrackingSampleEntity>

  @Query("UPDATE tracking_samples SET uploadState = 'UPLOADED' WHERE sampleId = :sampleId")
  suspend fun markUploaded(sampleId: String)

  @Query(
    "UPDATE tracking_samples SET attemptCount = attemptCount + 1, nextRetryAt = :nextRetryAt WHERE sampleId = :sampleId",
  )
  suspend fun markRetry(sampleId: String, nextRetryAt: String)

  @Query("SELECT COUNT(*) FROM tracking_samples WHERE uploadState = 'PENDING'")
  suspend fun pendingCount(): Int
}

@Database(entities = [TrackingSampleEntity::class], version = 1, exportSchema = false)
abstract class TrackingDatabase : RoomDatabase() {
  abstract fun sampleDao(): TrackingSampleDao

  companion object {
    @Volatile private var instance: TrackingDatabase? = null

    fun get(context: Context): TrackingDatabase {
      return instance ?: synchronized(this) {
        instance ?: Room.databaseBuilder(
          context.applicationContext,
          TrackingDatabase::class.java,
          "crm_native_tracking.db",
        ).build().also { instance = it }
      }
    }
  }
}
