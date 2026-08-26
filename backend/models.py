from sqlalchemy import Column, Integer, String, Float, Boolean, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

class Patient(Base):
    __tablename__ = 'patients'

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, unique=True, index=True) # e.g., TEMP-4587
    age = Column(Float, nullable=True)
    gender = Column(String, nullable=True)
    arrival_mode = Column(String)
    
    # Vitals
    hr = Column(Integer)
    sbp = Column(Integer)
    dbp = Column(Integer)
    rr = Column(Integer)
    spo2 = Column(Integer)
    temp = Column(Float)
    gcs = Column(Integer)
    pain_score = Column(Integer)
    history_available = Column(Boolean, default=False)
    
    # Engine Outputs (To be filled in Phase 2 & 3)
    triage_level = Column(Integer, nullable=True)
    override_reason = Column(String, nullable=True)

# Setup SQLite Database for the prototype
engine = create_engine("sqlite:///./triage_database.db", connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)