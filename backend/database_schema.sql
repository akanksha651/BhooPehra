--
-- PostgreSQL database dump
--

\restrict DJjSBBuqJYOWpLYCdZbudQwf7D6iSE1gdkSUF1RsUWWLNhe4j5LDnnt0Tfvbw4G

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: pgrouting; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgrouting WITH SCHEMA public;


--
-- Name: EXTENSION pgrouting; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgrouting IS 'pgRouting Extension';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id integer NOT NULL,
    alert_key character varying(120) NOT NULL,
    asset_id integer,
    risk_zone_id integer,
    asset_code character varying(30),
    asset_name character varying(150),
    alert_type character varying(40) NOT NULL,
    severity character varying(20) NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    risk_level character varying(20) NOT NULL,
    probability double precision NOT NULL,
    rainfall_trigger character varying(30) NOT NULL,
    confidence character varying(20) NOT NULL,
    source character varying(100) NOT NULL,
    priority character varying(10) NOT NULL,
    recommended_action text NOT NULL,
    status character varying(20) NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alerts_id_seq OWNED BY public.alerts.id;


--
-- Name: districts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.districts (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    state character varying(100) NOT NULL,
    code character varying(20),
    geometry public.geometry(MultiPolygon,4326)
);


--
-- Name: districts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.districts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: districts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.districts_id_seq OWNED BY public.districts.id;


--
-- Name: field_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_reports (
    id integer NOT NULL,
    report_code character varying(30) NOT NULL,
    title character varying(200) NOT NULL,
    reporter character varying(150) NOT NULL,
    hazard character varying(80) NOT NULL,
    severity character varying(20) NOT NULL,
    status character varying(30) NOT NULL,
    district_id integer,
    risk_zone_id integer,
    location character varying(200) NOT NULL,
    state character varying(100) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    description text NOT NULL,
    road_impact character varying(200) NOT NULL,
    village_impact character varying(200) NOT NULL,
    photo_count integer NOT NULL,
    verification_notes text,
    submitted_at timestamp without time zone NOT NULL,
    verified_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    geometry public.geometry(Point,4326) NOT NULL,
    response_status character varying(30) DEFAULT 'NOT_STARTED'::character varying NOT NULL,
    assigned_team character varying(150),
    alert_generated_at timestamp without time zone,
    assigned_at timestamp without time zone,
    started_at timestamp without time zone,
    resolved_at timestamp without time zone,
    response_notes text,
    reporter_token character varying(128)
);


--
-- Name: field_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.field_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: field_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.field_reports_id_seq OWNED BY public.field_reports.id;


--
-- Name: infrastructure_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infrastructure_assets (
    id integer NOT NULL,
    asset_code character varying(30) NOT NULL,
    name character varying(150) NOT NULL,
    asset_type character varying(30) NOT NULL,
    district_id integer NOT NULL,
    risk_zone_id integer,
    risk_level character varying(20) NOT NULL,
    probability double precision NOT NULL,
    priority character varying(10) NOT NULL,
    exposure_count integer NOT NULL,
    status character varying(30) NOT NULL,
    recommendation character varying(300),
    geometry public.geometry(Point,4326),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    capacity integer,
    source character varying(300)
);


--
-- Name: infrastructure_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.infrastructure_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: infrastructure_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.infrastructure_assets_id_seq OWNED BY public.infrastructure_assets.id;


--
-- Name: landslide_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landslide_events (
    id integer NOT NULL,
    source_record_id character varying(100) NOT NULL,
    source character varying(50) NOT NULL,
    source_type character varying(100) NOT NULL,
    state character varying(100) NOT NULL,
    district character varying(100) NOT NULL,
    slide_name character varying(200) NOT NULL,
    locality character varying(300),
    occurrence_date date,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    landslide_type character varying(100),
    material_type character varying(150),
    area_sq_m double precision,
    length_m double precision,
    width_m double precision,
    depth_m double precision,
    source_url text NOT NULL,
    verification_status character varying(50) NOT NULL,
    geometry public.geometry(Point,4326) NOT NULL,
    imported_at timestamp without time zone NOT NULL
);


--
-- Name: landslide_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.landslide_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: landslide_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.landslide_events_id_seq OWNED BY public.landslide_events.id;


--
-- Name: rainfall_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rainfall_observations (
    id integer NOT NULL,
    district_id integer NOT NULL,
    observed_at timestamp without time zone NOT NULL,
    rainfall_1h double precision NOT NULL,
    rainfall_24h double precision NOT NULL,
    rainfall_48h double precision NOT NULL,
    rainfall_72h double precision NOT NULL,
    antecedent_rainfall double precision NOT NULL,
    soil_moisture double precision,
    trigger_level character varying(30) NOT NULL,
    source character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source_latitude double precision,
    source_longitude double precision,
    source_timezone character varying(60),
    data_type character varying(30) DEFAULT 'MODEL_DERIVED'::character varying NOT NULL
);


--
-- Name: rainfall_observations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rainfall_observations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rainfall_observations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rainfall_observations_id_seq OWNED BY public.rainfall_observations.id;


--
-- Name: risk_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_zones (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    district_id integer NOT NULL,
    risk_level character varying(20) NOT NULL,
    probability double precision NOT NULL,
    confidence character varying(20) NOT NULL,
    rainfall_trigger character varying(100),
    priority character varying(10) NOT NULL,
    affected_villages integer NOT NULL,
    affected_roads integer NOT NULL,
    geometry public.geometry(Polygon,4326),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: risk_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.risk_zones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: risk_zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.risk_zones_id_seq OWNED BY public.risk_zones.id;


--
-- Name: road_network; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.road_network (
    id integer NOT NULL,
    osm_id character varying(30) NOT NULL,
    fclass character varying(30) NOT NULL,
    name character varying(150),
    ref character varying(50),
    oneway character varying(1) NOT NULL,
    maxspeed integer,
    layer integer,
    bridge character varying(1),
    tunnel character varying(1),
    source character varying(200) NOT NULL,
    blocked boolean NOT NULL,
    blockage_source character varying(50),
    blockage_report_id integer,
    blockage_verified_at timestamp without time zone,
    blockage_notes text,
    source_vertex integer,
    target_vertex integer,
    cost double precision,
    reverse_cost double precision,
    geometry public.geometry(LineString,4326) NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: road_network_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.road_network_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: road_network_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.road_network_id_seq OWNED BY public.road_network.id;


--
-- Name: road_routing_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.road_routing_edges (
    id bigint NOT NULL,
    source_road_id bigint NOT NULL,
    source bigint NOT NULL,
    target bigint NOT NULL,
    osm_id character varying(30) NOT NULL,
    fclass character varying(30) NOT NULL,
    name character varying(150),
    ref character varying(50),
    oneway character varying(1) NOT NULL,
    maxspeed integer,
    layer integer,
    bridge character varying(1),
    tunnel character varying(1),
    source_name character varying(200) NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    blockage_source character varying(50),
    blockage_report_id integer,
    blockage_verified_at timestamp without time zone,
    blockage_notes text,
    cost double precision NOT NULL,
    reverse_cost double precision NOT NULL,
    geometry public.geometry(LineString,4326) NOT NULL
);


--
-- Name: road_routing_edges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.road_routing_edges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: road_routing_edges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.road_routing_edges_id_seq OWNED BY public.road_routing_edges.id;


--
-- Name: road_routing_vertices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.road_routing_vertices (
    id bigint NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    geometry public.geometry(Point,4326) NOT NULL
);


--
-- Name: road_routing_vertices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.road_routing_vertices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: road_routing_vertices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.road_routing_vertices_id_seq OWNED BY public.road_routing_vertices.id;


--
-- Name: shelters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shelters (
    id integer NOT NULL,
    shelter_code character varying(30) NOT NULL,
    name character varying(150) NOT NULL,
    district_id integer NOT NULL,
    capacity integer,
    accessibility_status character varying(30) NOT NULL,
    operational_status character varying(30) NOT NULL,
    verification_status character varying(30) NOT NULL,
    source character varying(300),
    geometry public.geometry(Point,4326),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: shelters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shelters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shelters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shelters_id_seq OWNED BY public.shelters.id;


--
-- Name: alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts ALTER COLUMN id SET DEFAULT nextval('public.alerts_id_seq'::regclass);


--
-- Name: districts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts ALTER COLUMN id SET DEFAULT nextval('public.districts_id_seq'::regclass);


--
-- Name: field_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_reports ALTER COLUMN id SET DEFAULT nextval('public.field_reports_id_seq'::regclass);


--
-- Name: infrastructure_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_assets ALTER COLUMN id SET DEFAULT nextval('public.infrastructure_assets_id_seq'::regclass);


--
-- Name: landslide_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landslide_events ALTER COLUMN id SET DEFAULT nextval('public.landslide_events_id_seq'::regclass);


--
-- Name: rainfall_observations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rainfall_observations ALTER COLUMN id SET DEFAULT nextval('public.rainfall_observations_id_seq'::regclass);


--
-- Name: risk_zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_zones ALTER COLUMN id SET DEFAULT nextval('public.risk_zones_id_seq'::regclass);


--
-- Name: road_network id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_network ALTER COLUMN id SET DEFAULT nextval('public.road_network_id_seq'::regclass);


--
-- Name: road_routing_edges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_routing_edges ALTER COLUMN id SET DEFAULT nextval('public.road_routing_edges_id_seq'::regclass);


--
-- Name: road_routing_vertices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_routing_vertices ALTER COLUMN id SET DEFAULT nextval('public.road_routing_vertices_id_seq'::regclass);


--
-- Name: shelters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelters ALTER COLUMN id SET DEFAULT nextval('public.shelters_id_seq'::regclass);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: districts districts_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts
    ADD CONSTRAINT districts_code_key UNIQUE (code);


--
-- Name: districts districts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.districts
    ADD CONSTRAINT districts_pkey PRIMARY KEY (id);


--
-- Name: field_reports field_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_reports
    ADD CONSTRAINT field_reports_pkey PRIMARY KEY (id);


--
-- Name: infrastructure_assets infrastructure_assets_asset_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_assets
    ADD CONSTRAINT infrastructure_assets_asset_code_key UNIQUE (asset_code);


--
-- Name: infrastructure_assets infrastructure_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_assets
    ADD CONSTRAINT infrastructure_assets_pkey PRIMARY KEY (id);


--
-- Name: landslide_events landslide_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landslide_events
    ADD CONSTRAINT landslide_events_pkey PRIMARY KEY (id);


--
-- Name: landslide_events landslide_events_source_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landslide_events
    ADD CONSTRAINT landslide_events_source_record_id_key UNIQUE (source_record_id);


--
-- Name: rainfall_observations rainfall_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rainfall_observations
    ADD CONSTRAINT rainfall_observations_pkey PRIMARY KEY (id);


--
-- Name: risk_zones risk_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_zones
    ADD CONSTRAINT risk_zones_pkey PRIMARY KEY (id);


--
-- Name: road_network road_network_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_network
    ADD CONSTRAINT road_network_pkey PRIMARY KEY (id);


--
-- Name: road_routing_edges road_routing_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_routing_edges
    ADD CONSTRAINT road_routing_edges_pkey PRIMARY KEY (id);


--
-- Name: road_routing_vertices road_routing_vertices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_routing_vertices
    ADD CONSTRAINT road_routing_vertices_pkey PRIMARY KEY (id);


--
-- Name: shelters shelters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelters
    ADD CONSTRAINT shelters_pkey PRIMARY KEY (id);


--
-- Name: shelters shelters_shelter_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelters
    ADD CONSTRAINT shelters_shelter_code_key UNIQUE (shelter_code);


--
-- Name: idx_districts_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_districts_geometry ON public.districts USING gist (geometry);


--
-- Name: idx_field_reports_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_field_reports_geometry ON public.field_reports USING gist (geometry);


--
-- Name: idx_infrastructure_assets_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_infrastructure_assets_geometry ON public.infrastructure_assets USING gist (geometry);


--
-- Name: idx_landslide_events_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landslide_events_geometry ON public.landslide_events USING gist (geometry);


--
-- Name: idx_risk_zones_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_zones_geometry ON public.risk_zones USING gist (geometry);


--
-- Name: idx_road_network_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_road_network_geometry ON public.road_network USING gist (geometry);


--
-- Name: idx_road_routing_edges_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_road_routing_edges_blocked ON public.road_routing_edges USING btree (blocked);


--
-- Name: idx_road_routing_edges_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_road_routing_edges_geometry ON public.road_routing_edges USING gist (geometry);


--
-- Name: idx_road_routing_edges_osm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_road_routing_edges_osm_id ON public.road_routing_edges USING btree (osm_id);


--
-- Name: idx_road_routing_edges_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_road_routing_edges_source ON public.road_routing_edges USING btree (source);


--
-- Name: idx_road_routing_edges_source_road_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_road_routing_edges_source_road_id ON public.road_routing_edges USING btree (source_road_id);


--
-- Name: idx_road_routing_edges_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_road_routing_edges_target ON public.road_routing_edges USING btree (target);


--
-- Name: idx_road_routing_vertices_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_road_routing_vertices_geometry ON public.road_routing_vertices USING gist (geometry);


--
-- Name: idx_road_routing_vertices_xy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_road_routing_vertices_xy ON public.road_routing_vertices USING btree (x, y);


--
-- Name: idx_shelters_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shelters_geometry ON public.shelters USING gist (geometry);


--
-- Name: ix_alerts_alert_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_alerts_alert_key ON public.alerts USING btree (alert_key);


--
-- Name: ix_alerts_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_alerts_asset_id ON public.alerts USING btree (asset_id);


--
-- Name: ix_alerts_risk_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_alerts_risk_zone_id ON public.alerts USING btree (risk_zone_id);


--
-- Name: ix_alerts_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_alerts_severity ON public.alerts USING btree (severity);


--
-- Name: ix_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_alerts_status ON public.alerts USING btree (status);


--
-- Name: ix_field_reports_district_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_field_reports_district_id ON public.field_reports USING btree (district_id);


--
-- Name: ix_field_reports_report_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_field_reports_report_code ON public.field_reports USING btree (report_code);


--
-- Name: ix_field_reports_risk_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_field_reports_risk_zone_id ON public.field_reports USING btree (risk_zone_id);


--
-- Name: ix_field_reports_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_field_reports_severity ON public.field_reports USING btree (severity);


--
-- Name: ix_field_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_field_reports_status ON public.field_reports USING btree (status);


--
-- Name: ix_field_reports_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_field_reports_submitted_at ON public.field_reports USING btree (submitted_at);


--
-- Name: ix_road_network_blockage_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_road_network_blockage_report_id ON public.road_network USING btree (blockage_report_id);


--
-- Name: ix_road_network_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_road_network_blocked ON public.road_network USING btree (blocked);


--
-- Name: ix_road_network_fclass; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_road_network_fclass ON public.road_network USING btree (fclass);


--
-- Name: ix_road_network_osm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_road_network_osm_id ON public.road_network USING btree (osm_id);


--
-- Name: ix_road_network_source_vertex; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_road_network_source_vertex ON public.road_network USING btree (source_vertex);


--
-- Name: ix_road_network_target_vertex; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_road_network_target_vertex ON public.road_network USING btree (target_vertex);


--
-- Name: alerts alerts_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.infrastructure_assets(id);


--
-- Name: alerts alerts_risk_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_risk_zone_id_fkey FOREIGN KEY (risk_zone_id) REFERENCES public.risk_zones(id);


--
-- Name: field_reports field_reports_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_reports
    ADD CONSTRAINT field_reports_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id);


--
-- Name: field_reports field_reports_risk_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_reports
    ADD CONSTRAINT field_reports_risk_zone_id_fkey FOREIGN KEY (risk_zone_id) REFERENCES public.risk_zones(id);


--
-- Name: infrastructure_assets infrastructure_assets_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_assets
    ADD CONSTRAINT infrastructure_assets_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id);


--
-- Name: infrastructure_assets infrastructure_assets_risk_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infrastructure_assets
    ADD CONSTRAINT infrastructure_assets_risk_zone_id_fkey FOREIGN KEY (risk_zone_id) REFERENCES public.risk_zones(id);


--
-- Name: rainfall_observations rainfall_observations_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rainfall_observations
    ADD CONSTRAINT rainfall_observations_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id);


--
-- Name: risk_zones risk_zones_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_zones
    ADD CONSTRAINT risk_zones_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id);


--
-- Name: shelters shelters_district_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelters
    ADD CONSTRAINT shelters_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id);


--
-- PostgreSQL database dump complete
--

\unrestrict DJjSBBuqJYOWpLYCdZbudQwf7D6iSE1gdkSUF1RsUWWLNhe4j5LDnnt0Tfvbw4G

