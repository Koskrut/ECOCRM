-- Add Ringostat as a LeadSource for call-created leads
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'RINGOSTAT';

