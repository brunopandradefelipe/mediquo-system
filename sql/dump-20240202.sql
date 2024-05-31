--
-- PostgreSQL database dump
--

-- Dumped from database version 12.17 (Ubuntu 12.17-1.pgdg20.04+1)
-- Dumped by pg_dump version 16.1 (Ubuntu 16.1-1.pgdg20.04+1)

-- Started on 2024-02-02 09:35:34 -03

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO postgres;

--
-- TOC entry 3013 (class 0 OID 0)
-- Dependencies: 7
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 203 (class 1259 OID 24895)
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    company_id integer NOT NULL,
    company_name character varying(100) NOT NULL,
    company_document character varying(32) NOT NULL,
    x_api_key character varying(32) NOT NULL,
    x_secret_key character varying(128) NOT NULL,
    company_img character varying(128),
    access_level integer DEFAULT 0 NOT NULL,
    number_of_active_licenses integer DEFAULT 0 NOT NULL,
    number_of_disabled_licenses integer DEFAULT 0 NOT NULL,
    max_licenses integer NOT NULL,
    status integer DEFAULT 1 NOT NULL,
    epharma boolean DEFAULT false NOT NULL,
    redemptions integer DEFAULT 1,
    sms_text character varying(144),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    prefix character varying(16)
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- TOC entry 3015 (class 0 OID 0)
-- Dependencies: 203
-- Name: TABLE companies; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.companies IS 'Tabela de empresas cadastradas';


--
-- TOC entry 204 (class 1259 OID 24908)
-- Name: companies_company_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.companies_company_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.companies_company_id_seq OWNER TO postgres;

--
-- TOC entry 3016 (class 0 OID 0)
-- Dependencies: 204
-- Name: companies_company_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.companies_company_id_seq OWNED BY public.companies.company_id;


--
-- TOC entry 207 (class 1259 OID 25894)
-- Name: csv_upload; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.csv_upload (
    rota character varying(255),
    status character varying(20),
    secret_key character varying(255),
    apk_key character varying(255),
    prefixo character varying(255),
    company_id bigint,
    created_at timestamp(0) without time zone DEFAULT now(),
    updated_at timestamp(0) without time zone DEFAULT now(),
    acao character varying,
    csv_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id bigint NOT NULL,
    mensagem json NOT NULL
);


ALTER TABLE public.csv_upload OWNER TO postgres;

--
-- TOC entry 3017 (class 0 OID 0)
-- Dependencies: 207
-- Name: COLUMN csv_upload.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.csv_upload.status IS '[erro,Aguardando Processamento,Processado]';


--
-- TOC entry 205 (class 1259 OID 24910)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    user_document character varying(20) NOT NULL,
    phone character varying(20) NOT NULL,
    company_id integer NOT NULL,
    email character varying(128) NOT NULL,
    password character varying(128) NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 3018 (class 0 OID 0)
-- Dependencies: 205
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.users IS 'Usuarios Cadastrados';


--
-- TOC entry 206 (class 1259 OID 24913)
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_user_id_seq OWNER TO postgres;

--
-- TOC entry 3019 (class 0 OID 0)
-- Dependencies: 206
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- TOC entry 2857 (class 2604 OID 24915)
-- Name: companies company_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies ALTER COLUMN company_id SET DEFAULT nextval('public.companies_company_id_seq'::regclass);


--
-- TOC entry 2865 (class 2604 OID 24916)
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);



SELECT pg_catalog.setval('public.companies_company_id_seq', 42, true);


--
-- TOC entry 3021 (class 0 OID 0)
-- Dependencies: 206
-- Name: users_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_user_id_seq', 33, true);


--
-- TOC entry 2870 (class 2606 OID 24918)
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (company_id);


--
-- TOC entry 2872 (class 2606 OID 25875)
-- Name: users users_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pk PRIMARY KEY (user_id);


--
-- TOC entry 2873 (class 1259 OID 24919)
-- Name: users_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_user_id_idx ON public.users USING btree (user_id);


--
-- TOC entry 2875 (class 2606 OID 25950)
-- Name: csv_upload csv_upload_companies_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.csv_upload
    ADD CONSTRAINT csv_upload_companies_fk FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- TOC entry 2876 (class 2606 OID 25923)
-- Name: csv_upload csv_upload_users_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.csv_upload
    ADD CONSTRAINT csv_upload_users_fk FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- TOC entry 2874 (class 2606 OID 24920)
-- Name: users users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- TOC entry 3014 (class 0 OID 0)
-- Dependencies: 7
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


-- Completed on 2024-02-02 09:35:34 -03

--
-- PostgreSQL database dump complete
--

