import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { QueryVenueDto } from './dto/query-venue.dto';
import { CreateVenueCourtDto } from './dto/create-venue-court.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
export declare class VenuesController {
    private readonly venuesService;
    constructor(venuesService: VenuesService);
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
    findOne(id: string): Promise<{
        courts: {
            id: string;
            venueId: string;
            courtName: string;
            status: string;
        }[];
        id: string;
        name: string;
        locationAddress: string;
        locationGeolocation: string | null;
        imagesUrls: string[];
        createdAt: Date;
        deletedAt: Date | null;
    }>;
    create(createVenueDto: CreateVenueDto, user: JwtPayload): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        deletedAt: Date | null;
        locationGeolocation: string | null;
        locationAddress: string;
        imagesUrls: string[];
    }>;
    update(id: string, updateVenueDto: UpdateVenueDto, user: JwtPayload): Promise<{
        id: string;
        name: string;
        locationAddress: string;
        locationGeolocation: string | null;
        imagesUrls: string[];
        createdAt: Date;
        deletedAt: Date | null;
    }>;
    remove(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        deletedAt: Date | null;
        locationGeolocation: string | null;
        locationAddress: string;
        imagesUrls: string[];
    }>;
    addCourt(id: string, createVenueCourtDto: CreateVenueCourtDto): Promise<{
        id: string;
        status: string;
        venueId: string;
        courtName: string;
    }>;
    removeCourt(id: string, courtId: string): Promise<{
        id: string;
        status: string;
        venueId: string;
        courtName: string;
    }>;
}
