from skyfield.api import load, wgs84
from datetime import datetime
import pytz
import shutil

import os
from skyfield.api import Loader

# Setup Skyfield loader:
# On Vercel, we MUST use /tmp for any downloads/writing (like Leap_Second.dat)
# but we can read our bundled de421.bsp from the root.
if os.environ.get('VERCEL'):
    load_path = '/tmp'
    load = Loader(load_path)
    # Copy de421.bsp to /tmp so Skyfield can read/write in its "standard" way if needed
    if os.path.exists('de421.bsp') and not os.path.exists('/tmp/de421.bsp'):
        shutil.copy('de421.bsp', '/tmp/de421.bsp')
    eph = load('de421.bsp')
else:
    load_path = '.'
    load = Loader(load_path)
    eph = load('de421.bsp')

ts = load.timescale()

PLANETS = {
    'Sun': eph['sun'],
    'Moon': eph['moon'],
    'Mercury': eph['mercury'],
    'Venus': eph['venus'],
    'Mars': eph['mars'],
    'Jupiter': eph['jupiter barycenter'],
    'Saturn': eph['saturn barycenter'],
    'Uranus': eph['uranus barycenter'],
    'Neptune': eph['neptune barycenter']
}
earth = eph['earth']

def get_celestial_data(lat: float, lon: float, elevation: float = 0, time_iso: str = None):
    # Set observer location
    observer = earth + wgs84.latlon(lat, lon, elevation_m=elevation)
    
    # Set time
    if time_iso:
        try:
            dt = datetime.fromisoformat(time_iso.replace('Z', '+00:00'))
        except ValueError:
            dt = datetime.utcnow().replace(tzinfo=pytz.utc)
    else:
        dt = datetime.utcnow().replace(tzinfo=pytz.utc)
        
    t = ts.from_datetime(dt)
    
    bodies = {}
    for name, body in PLANETS.items():
        astrometric = observer.at(t).observe(body)
        apparent = astrometric.apparent()
        alt, az, distance = apparent.altaz()
        
        is_visible = alt.degrees > 0
        
        bodies[name] = {
            'altitude': float(alt.degrees),
            'azimuth': float(az.degrees),
            'distance_au': float(distance.au),
            'visible': bool(alt.degrees > 0)
        }
    
    from skyfield.api import Star
    
    # Mocking major stars and Milky Way plane for the frontend to render
    star_data = [
        {"name": "Sirius", "ra": 6.75, "dec": -16.71, "mag": -1.46},
        {"name": "Canopus", "ra": 6.39, "dec": -52.69, "mag": -0.74},
        {"name": "Rigil Kentaurus", "ra": 14.66, "dec": -60.83, "mag": -0.27},
        {"name": "Arcturus", "ra": 14.26, "dec": 19.18, "mag": -0.05},
        {"name": "Vega", "ra": 18.61, "dec": 38.78, "mag": 0.03}
    ]
    
    stars = []
    for s in star_data:
        st = Star(ra_hours=s["ra"], dec_degrees=s["dec"])
        obs = observer.at(t).observe(st).apparent()
        alt, az, _ = obs.altaz()
        stars.append({
            "name": s["name"],
            "altitude": float(alt.degrees),
            "azimuth": float(az.degrees),
            "mag": s["mag"],
            "visible": bool(alt.degrees > 0)
        })
    
    # Calculate real-time orientation of the Galactic Plane
    galactic_center = Star(ra_hours=17.7611, dec_degrees=-29.0078)
    galactic_pole = Star(ra_hours=12.8573, dec_degrees=27.1283)
    
    gc_obs = observer.at(t).observe(galactic_center).apparent()
    gc_alt, gc_az, _ = gc_obs.altaz()
    
    gp_obs = observer.at(t).observe(galactic_pole).apparent()
    gp_alt, gp_az, _ = gp_obs.altaz()
    
    milky_way = {
        "center": {"altitude": float(gc_alt.degrees), "azimuth": float(gc_az.degrees)},
        "pole": {"altitude": float(gp_alt.degrees), "azimuth": float(gp_az.degrees)}
    }
        
    return {
        "time_utc": dt.isoformat(),
        "observer": {"latitude": lat, "longitude": lon, "elevation": elevation},
        "bodies": bodies,
        "stars": stars,
        "milky_way": milky_way
    }
