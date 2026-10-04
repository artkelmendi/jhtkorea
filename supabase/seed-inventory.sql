begin;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-513','available','{"brand": "Hyundai", "model": "Santa Fe", "ref": "CK-2026-513", "body": "SUV", "fuel": "Diesel", "transmission": "Automatic", "year": 2020, "price": 8340.0, "mileage": null, "seats": 7, "image": "assets/car-1.webp", "gallery": ["assets/car-1.webp", "assets/car-1-1.webp", "assets/car-1-2.webp", "assets/car-1-3.webp", "assets/car-1-4.webp"]}'::jsonb,now()-interval '0 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-497','available','{"brand": "Hyundai", "model": "Tucson", "ref": "CK-2026-497", "body": "SUV", "fuel": "Diesel", "transmission": "Automatic", "year": 2022, "price": 9220.0, "mileage": null, "seats": 5, "image": "assets/car-2.webp", "gallery": ["assets/car-2.webp", "assets/car-2-1.webp", "assets/car-2-2.webp", "assets/car-2-3.webp", "assets/car-2-4.webp"]}'::jsonb,now()-interval '1 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-499','available','{"brand": "Hyundai", "model": "Avante", "ref": "CK-2026-499", "body": "Sedan", "fuel": "Diesel", "transmission": "Automatic", "year": 2016, "price": 2990.0, "mileage": null, "seats": 5, "image": "assets/car-3.webp", "gallery": ["assets/car-3.webp", "assets/car-3-1.webp", "assets/car-3-2.webp", "assets/car-3-3.webp", "assets/car-3-4.webp"]}'::jsonb,now()-interval '2 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-478','available','{"brand": "Hyundai", "model": "Staria", "ref": "CK-2026-478", "body": "Van", "fuel": "Diesel", "transmission": "Automatic", "year": 2022, "price": 12890.0, "mileage": null, "seats": 11, "image": "assets/car-4.webp", "gallery": ["assets/car-4.webp", "assets/car-4-1.webp", "assets/car-4-2.webp", "assets/car-4-3.webp", "assets/car-4-4.webp"]}'::jsonb,now()-interval '3 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-448','available','{"brand": "Hyundai", "model": "Palisade", "ref": "CK-2026-448", "body": "SUV", "fuel": "Diesel", "transmission": "Automatic", "year": 2019, "price": 12200.0, "mileage": null, "seats": 8, "image": "assets/car-5.webp", "gallery": ["assets/car-5.webp", "assets/car-5-1.webp", "assets/car-5-2.webp", "assets/car-5-3.webp", "assets/car-5-4.webp"]}'::jsonb,now()-interval '4 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-501','available','{"brand": "Hyundai", "model": "i30", "ref": "CK-2026-501", "body": "Hatchback", "fuel": "Diesel", "transmission": "Automatic", "year": 2012, "price": 2620.0, "mileage": null, "seats": 5, "image": "assets/car-6.webp", "gallery": ["assets/car-6.webp", "assets/car-6-1.webp", "assets/car-6-2.webp", "assets/car-6-3.webp", "assets/car-6-4.webp"]}'::jsonb,now()-interval '5 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-511','available','{"brand": "Kia", "model": "Sorento", "ref": "CK-2026-511", "body": "SUV", "fuel": "Diesel", "transmission": "Automatic", "year": 2016, "price": 5820.0, "mileage": null, "seats": 7, "image": "assets/car-7.webp", "gallery": ["assets/car-7.webp", "assets/car-7-1.webp", "assets/car-7-2.webp", "assets/car-7-3.webp", "assets/car-7-4.webp"]}'::jsonb,now()-interval '6 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-486','available','{"brand": "Kia", "model": "Sorento", "ref": "CK-2026-486", "body": "SUV", "fuel": "Diesel", "transmission": "Automatic", "year": 2018, "price": 8740.0, "mileage": null, "seats": 7, "image": "assets/car-8.webp", "gallery": ["assets/car-8.webp", "assets/car-8-1.webp", "assets/car-8-2.webp", "assets/car-8-3.webp", "assets/car-8-4.webp"]}'::jsonb,now()-interval '7 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-505','available','{"brand": "Kia", "model": "Sportage", "ref": "CK-2026-505", "body": "SUV", "fuel": "Diesel", "transmission": "Automatic", "year": 2011, "price": 2720.0, "mileage": null, "seats": 5, "image": "assets/car-9.webp", "gallery": ["assets/car-9.webp", "assets/car-9-1.webp", "assets/car-9-2.webp", "assets/car-9-3.webp", "assets/car-9-4.webp"]}'::jsonb,now()-interval '8 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-373','available','{"brand": "Kia", "model": "K5 Hybrid", "ref": "CK-2026-373", "body": "Sedan", "fuel": "Hybrid", "transmission": "Automatic", "year": 2015, "price": 3230.0, "mileage": null, "seats": 5, "image": "assets/car-10.webp", "gallery": ["assets/car-10.webp", "assets/car-10-1.webp", "assets/car-10-2.webp", "assets/car-10-3.webp", "assets/car-10-4.webp"]}'::jsonb,now()-interval '9 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-251','available','{"brand": "Kia", "model": "Carnival", "ref": "CK-2026-251", "body": "Van", "fuel": "Diesel", "transmission": "Automatic", "year": 2019, "price": 4989.0, "mileage": null, "seats": 9, "image": "assets/car-11.webp", "gallery": ["assets/car-11.webp", "assets/car-11-1.webp", "assets/car-11-2.webp", "assets/car-11-3.webp", "assets/car-11-4.webp"]}'::jsonb,now()-interval '10 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-492','available','{"brand": "Volkswagen", "model": "Tiguan", "ref": "CK-2026-492", "body": "SUV", "fuel": "Diesel", "transmission": "Automatic", "year": 2015, "price": 3250.0, "mileage": 302596, "seats": 5, "image": "assets/car-12.webp", "gallery": ["assets/car-12.webp", "assets/car-12-1.webp", "assets/car-12-2.webp", "assets/car-12-3.webp", "assets/car-12-4.webp"]}'::jsonb,now()-interval '11 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-493','available','{"brand": "Volkswagen", "model": "Golf", "ref": "CK-2026-493", "body": "Hatchback", "fuel": "Diesel", "transmission": "Automatic", "year": 2013, "price": 3420.0, "mileage": 177034, "seats": 5, "image": "assets/car-13.webp", "gallery": ["assets/car-13.webp", "assets/car-13-1.webp", "assets/car-13-2.webp", "assets/car-13-3.webp", "assets/car-13-4.webp"]}'::jsonb,now()-interval '12 minutes') on conflict(slug) do nothing;
insert into public.jht_vehicles(slug,status,payload,created_at) values('ck-2026-340','available','{"brand": "Porsche", "model": "Cayenne", "ref": "CK-2026-340", "body": "SUV", "fuel": "Gasoline", "transmission": "Automatic", "year": 2010, "price": 5900.0, "mileage": null, "seats": 5, "image": "assets/car-14.webp", "gallery": ["assets/car-14.webp", "assets/car-14-1.webp", "assets/car-14-2.webp", "assets/car-14-3.webp", "assets/car-14-4.webp"]}'::jsonb,now()-interval '13 minutes') on conflict(slug) do nothing;
insert into public.jht_notices(slug,title,content,status,created_at) values('march-2026-shipping','March 2026 shipping schedule & rate changes','SHIPPING UPDATE / 01 MAR 2026

Historical information from the original JHT Korea notice.

Rate changes

West Africa (Nigeria and Ghana): a $50 fuel surcharge increase.

East Africa (Kenya and Tanzania): no change in the notice.

Madagascar: container rates reduced by $100.

Chile (Iquique): RoRo unchanged and container rates reduced by $150.

Departures stated in the notice

Korea to Lagos: second and fourth Wednesday.

Korea to Mombasa: Friday.

Korea to Tamatave: first and fifteenth of each month.

Korea to Iquique: Monday.

Customs timing

The notice asked buyers to complete customs clearance at least three business days before the scheduled departure.

Planning a shipment now?

Tell the team your destination and vehicle reference for a current quote and departure date.

Original historical notice: https://jhtcar.com/notice.php?id=2','published','2026-03-01') on conflict(slug) do nothing;
commit;
