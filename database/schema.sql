-- Fieldnotes initial schema. Safe to run repeatedly; no tables or records are dropped.
-- Apply to an empty project database, then run the CLI seed script below.
CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attractions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  short_description VARCHAR(320) NOT NULL,
  description TEXT NULL,
  distance_km DECIMAL(5,1) NULL,
  opening_hours VARCHAR(180) NULL,
  entrance_fee DECIMAL(10,2) NULL COMMENT 'Per-person LKR; NULL means unknown, zero means confirmed free',
  fee_currency CHAR(3) NOT NULL DEFAULT 'LKR',
  facilities VARCHAR(500) NULL,
  travel_tips VARCHAR(1200) NULL,
  visit_minutes SMALLINT UNSIGNED NULL,
  image_url VARCHAR(2048) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_attractions_name (name),
  KEY idx_attractions_distance (distance_km),
  CONSTRAINT chk_attractions_distance CHECK (distance_km IS NULL OR (distance_km >= 0 AND distance_km <= 25)),
  CONSTRAINT chk_attractions_coordinates CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attraction_categories (
  attraction_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (attraction_id, category_id),
  KEY idx_ac_category (category_id),
  CONSTRAINT fk_ac_attraction FOREIGN KEY (attraction_id) REFERENCES attractions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ac_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Facilities are normalized for the SRS data model while the existing
-- attractions.facilities text column remains for backward compatibility.
CREATE TABLE IF NOT EXISTS facilities (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attraction_facilities (
  attraction_id INT UNSIGNED NOT NULL,
  facility_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (attraction_id, facility_id),
  KEY idx_af_facility (facility_id),
  CONSTRAINT fk_af_attraction FOREIGN KEY (attraction_id) REFERENCES attractions(id) ON DELETE CASCADE,
  CONSTRAINT fk_af_facility FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  ip_hash CHAR(64) NOT NULL PRIMARY KEY,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  window_started DATETIME NOT NULL,
  locked_until DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO categories (name, slug, is_system) VALUES
('Nature','nature',1),('Religious','religious',1),('Heritage','heritage',1),('Recreational','recreational',1);

-- Proposal-based records only. Unsupported operating details and coordinates stay NULL.
INSERT INTO attractions (id,name,short_description,description,distance_km) VALUES
(1,'Pilikuttuwa Cave Temple','An ancient Buddhist site with natural caves and rock formations, suited to sightseeing, gentle hiking and photography.','An ancient Buddhist site featuring natural caves, rock formations, and a peaceful environment suitable for sightseeing, hiking, and photography.',9.0),
(2,'Maligatenna Rajamaha Viharaya','A historic Buddhist temple in a scenic setting, combining religious and natural surroundings.','A historic Buddhist temple located in a scenic area, offering visitors a combination of religious and natural surroundings.',8.0),
(3,'Mitirigala Nissarana Vanaya','A forest monastery surrounded by dense greenery, offering a quiet setting for nature exploration and meditation.','A forest monastery surrounded by dense greenery, providing a peaceful environment for nature exploration and meditation.',7.0),
(4,'Warana Rajamaha Viharaya','An ancient Buddhist temple associated with caves, rocks and natural surroundings.','An ancient Buddhist temple associated with caves, rocks, and natural surroundings, providing cultural and religious value.',15.0),
(5,'Attanagalla Rajamaha Viharaya','A historically significant ancient Buddhist temple associated with the story of King Sri Sangabodhi.','A historically significant ancient Buddhist temple associated with the history of King Sri Sangabodhi and Buddhist heritage in Sri Lanka.',8.0),
(6,'Horagolla National Park','A protected natural area known for biodiversity, greenery, nature walks and wildlife observation.','A protected natural area known for its biodiversity, greenery, and opportunities for nature walks and wildlife observation.',18.0),
(7,'Kaleiliya Wetlands','A natural wetland environment for nature observation, birdwatching, photography and outdoor visits.','A natural wetland environment suitable for nature observation, bird watching, photography, and relaxing outdoor activities.',18.0),
(8,'Wathurugama Ambalama','A traditional historical structure representing local architecture and heritage.','A traditional historical structure representing local architectural heritage and providing a short cultural visit opportunity.',3.0),
(9,'Nittambuwa Clock Tower & surrounds','A recognizable local landmark with shops and food nearby, suitable for a short stop.','A recognizable local landmark surrounded by shops and food outlets, suitable for a short visit and combining with nearby attractions.',13.0),
(10,'Henarathgoda Botanical Garden','A historic botanical garden established in 1876 with varied plant life and landscaped grounds.','A historic botanical garden established in 1876, featuring a wide variety of plants, landscaped areas, and historical significance.',19.0)
ON DUPLICATE KEY UPDATE id=id;

INSERT IGNORE INTO attraction_categories (attraction_id,category_id)
SELECT a.id,c.id FROM attractions a JOIN categories c ON
  (a.id IN (1,2,4,5) AND c.slug IN ('religious','heritage')) OR
  (a.id=3 AND c.slug IN ('nature','religious')) OR
  (a.id IN (6,7) AND c.slug='nature') OR
  (a.id=8 AND c.slug='heritage') OR
  (a.id=9 AND c.slug='recreational') OR
  (a.id=10 AND c.slug IN ('nature','heritage'))
WHERE a.id BETWEEN 1 AND 10;
