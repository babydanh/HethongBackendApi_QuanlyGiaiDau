import type { AppDb } from '../../database/db.types';
import { AuditService } from '../audit/audit.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { QueryVenueDto } from './dto/query-venue.dto';
import { CreateVenueCourtDto } from './dto/create-venue-court.dto';
export declare class VenuesRepository {
    private readonly db;
    private readonly auditService;
    constructor(db: AppDb, auditService: AuditService);
    findAll(query: QueryVenueDto): Promise<{
        data: {
            id: string;
            name: string;
            locationAddress: string;
            locationGeolocation: string | null;
            imagesUrls: string[];
            createdAt: Date;
            deletedAt: Date | null;
        }[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    }>;
    findById(id: string): Promise<{
        id: string;
        name: string;
        locationAddress: string;
        locationGeolocation: string | null;
        imagesUrls: string[];
        createdAt: Date;
        deletedAt: Date | null;
    } | null>;
    create(userId: string, data: CreateVenueDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        deletedAt: Date | null;
        locationGeolocation: string | null;
        locationAddress: string;
        imagesUrls: string[];
    }>;
    update(id: string, userId: string, data: UpdateVenueDto): Promise<{
        id: string;
        name: string;
        locationAddress: string;
        locationGeolocation: string | null;
        imagesUrls: string[];
        createdAt: Date;
        deletedAt: Date | null;
    }>;
    delete(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        deletedAt: Date | null;
        locationGeolocation: string | null;
        locationAddress: string;
        imagesUrls: string[];
    }>;
    findCourtsByVenue(venueId: string): Promise<{
        id: string;
        venueId: string;
        courtName: string;
        status: string;
    }[]>;
    addCourt(venueId: string, data: CreateVenueCourtDto): Promise<{
        id: string;
        status: string;
        venueId: string;
        courtName: string;
    }>;
    removeCourt(courtId: string): Promise<{
        id: string;
        status: string;
        venueId: string;
        courtName: string;
    }>;
}
