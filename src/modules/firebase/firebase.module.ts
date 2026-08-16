import { Module, Global } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
