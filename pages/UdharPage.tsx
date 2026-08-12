import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserIcon } from '../components/icons/UserIcon';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { TrashIcon } from '../components/icons/TrashIcon';
import { useAppContext } from '../context/AppContext';

const UdharPage: React.FC = () => {
    const navigate = useNavigate();
    const { 
        companyNames, 
        locations, 
        addCompany, 
        deleteCompany, 
        addLocation, 
        deleteLocation 
    } = useAppContext();

    const [people, setPeople] = useState<{ name: string; color: string }[]>([]);
    const [newPersonName, setNewPersonName] = useState('');
    const [newCompany, setNewCompany] = useState('');
    const [newLocation, setNewLocation] = useState('');

    // Load from localStorage on mount
    useEffect(() => {
        const savedPeople = localStorage.getItem('personal_udhar_people');
        if (savedPeople) {
            setPeople(JSON.parse(savedPeople));
        } else {
            // Initial default people
            const initial = [
                { name: 'LAXMAN', color: 'blue' },
                { name: 'BM', color: 'orange' },
            ];
            setPeople(initial);
            localStorage.setItem('personal_udhar_people', JSON.stringify(initial));
        }
    }, []);

    const savePeople = (newList: { name: string; color: string }[]) => {
        setPeople(newList);
        localStorage.setItem('personal_udhar_people', JSON.stringify(newList));
    };

    const handleAddPerson = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPersonName.trim()) return;
        
        if (people.some(p => p.name.toUpperCase() === newPersonName.trim().toUpperCase())) {
            alert('Customer already exists!');
            return;
        }

        const colors = ['blue', 'orange', 'green', 'purple', 'indigo', 'rose'];
        const randomColor = colors[people.length % colors.length];
        
        const newList = [...people, { name: newPersonName.trim().toUpperCase(), color: randomColor }];
        savePeople(newList);
        setNewPersonName('');
    };

    const handleDeletePerson = (e: React.MouseEvent, nameToDelete: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm(`Delete ${nameToDelete} from the list?`)) {
            const newList = people.filter(p => p.name !== nameToDelete);
            savePeople(newList);
        }
    };

    const handleAddCompany = () => {
        if (newCompany.trim()) {
            if (companyNames.includes(newCompany.trim().toUpperCase())) {
                alert('Company already exists!');
                return;
            }
            addCompany(newCompany.trim().toUpperCase());
            setNewCompany('');
        }
    };

    const handleAddLocation = () => {
        if (newLocation.trim()) {
            if (locations.includes(newLocation.trim().toUpperCase())) {
                alert('Location already exists!');
                return;
            }
            addLocation(newLocation.trim().toUpperCase());
            setNewLocation('');
        }
    };

    return (
        <div className="max-w-2xl mx-auto px-4 pb-32 space-y-6">
            <header className="flex items-center justify-between pt-6 pb-2">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 p-2 rounded-xl active:scale-95 shadow-sm transition-all" style={{background:'white',border:'1px solid #E0E7FF',color:'#6366F1'}}>
                    <ArrowLeftIcon className="h-5 w-5"/>
                </button>
                <div className="text-center">
                   <h1 className="text-xl font-black tracking-tight uppercase leading-none" style={{color:'#1E1B4B'}}>Data Sync</h1>
                   <p className="text-[9px] font-black uppercase tracking-widest mt-1" style={{color:'#9CA3AF'}}>Management Console</p>
                </div>
                <div className="w-10"></div>
            </header>

            {/* Customers Section */}
            <div className="mb-12 rounded-3xl p-5 shadow-sm" style={{background:'white',border:'1px solid #E0E7FF'}}>
                <div className="flex items-center gap-2 mb-5">
                   <span className="w-2 h-2 rounded-full animate-pulse" style={{background:'#8B5CF6'}}></span>
                   <h2 className="text-[10px] font-black uppercase tracking-widest" style={{color:'#9CA3AF'}}>Personal Partners</h2>
                </div>
                <form onSubmit={handleAddPerson} className="mb-6 flex gap-2">
                    <input
                        type="text"
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        placeholder="ADD NEW PARTNER..."
                        className="flex-grow rounded-2xl px-4 py-3 font-bold outline-none transition-all uppercase text-xs"
                        style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
                    />
                    <button
                        type="submit"
                        className="text-white font-black px-5 py-3 rounded-2xl shadow-md active:scale-95 transition-all text-[10px] tracking-widest"
                        style={{background:'linear-gradient(135deg,#6366F1,#8B5CF6)',boxShadow:'0 4px 14px rgba(99,102,241,0.35)'}}
                    >
                        ADD
                    </button>
                </form>

                <div className="space-y-3">
                    {people.map(person => (
                        <div key={person.name} className="relative">
                            <Link
                                to={`/udhar/${person.name}`}
                                className="block rounded-2xl p-4 active:scale-[0.98] transition-all"
                                style={{background:'#F5F7FF',border:'1px solid #E0E7FF'}}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-xl shadow-sm" style={{background:'white',border:'1px solid #E0E7FF'}}>
                                            <UserIcon className="h-5 w-5" style={{color:'#6366F1'} as any} />
                                        </div>
                                        <h3 className="text-[13px] font-black uppercase tracking-widest" style={{color:'#1E1B4B'}}>{person.name}</h3>
                                    </div>
                                </div>
                            </Link>
                            <button
                                onClick={(e) => handleDeletePerson(e, person.name)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-xl transition-all z-10"
                                style={{color:'#CBD5E1'}}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#E11D48'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#CBD5E1'}
                            >
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* System Data Section */}
            <div className="space-y-6">
                {/* Manage Companies */}
                <div className="rounded-3xl p-5 shadow-sm" style={{background:'white',border:'1px solid #E0E7FF'}}>
                    <div className="flex items-center gap-2 mb-5">
                       <span className="w-2 h-2 rounded-full" style={{background:'#6366F1'}}></span>
                       <h2 className="text-[10px] font-black uppercase tracking-widest" style={{color:'#9CA3AF'}}>Business Companies</h2>
                    </div>
                    <div>
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newCompany}
                                onChange={(e) => setNewCompany(e.target.value)}
                                placeholder="NEW COMPANY..."
                                className="flex-1 rounded-2xl px-4 py-3 text-xs font-black uppercase outline-none transition-all"
                                style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
                            />
                            <button onClick={handleAddCompany} className="text-white px-5 py-3 rounded-2xl font-black tracking-widest text-[10px] active:scale-95 transition-all" style={{background:'linear-gradient(135deg,#6366F1,#4F46E5)',boxShadow:'0 4px 14px rgba(99,102,241,0.30)'}}>ADD</button>
                        </div>
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                            {companyNames.map(name => (
                                <div key={name} className="flex items-center pl-3 pr-1 py-1 rounded-xl" style={{background:'#EEF2FF',border:'1px solid #C7D2FE'}}>
                                    <span className="text-[10px] font-black uppercase tracking-widest" style={{color:'#4F46E5'}}>{name}</span>
                                    <button onClick={() => { if(window.confirm(`Delete ${name}?`)) deleteCompany(name); }} className="ml-2 p-1.5 rounded-lg transition-colors" style={{color:'#A5B4FC'}}>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Manage Locations */}
                <div className="rounded-3xl p-5 shadow-sm" style={{background:'white',border:'1px solid #E0E7FF'}}>
                    <div className="flex items-center gap-2 mb-5">
                       <span className="w-2 h-2 rounded-full" style={{background:'#10B981'}}></span>
                       <h2 className="text-[10px] font-black uppercase tracking-widest" style={{color:'#9CA3AF'}}>System Locations</h2>
                    </div>
                    <div>
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newLocation}
                                onChange={(e) => setNewLocation(e.target.value)}
                                placeholder="NEW LOCATION..."
                                className="flex-1 rounded-2xl px-4 py-3 text-xs font-black uppercase outline-none transition-all"
                                style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
                            />
                            <button onClick={handleAddLocation} className="text-white px-5 py-3 rounded-2xl font-black tracking-widest text-[10px] active:scale-95 transition-all" style={{background:'linear-gradient(135deg,#10B981,#059669)',boxShadow:'0 4px 14px rgba(16,185,129,0.30)'}}>ADD</button>
                        </div>
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                            {locations.map(loc => (
                                <div key={loc} className="flex items-center pl-3 pr-1 py-1 rounded-xl" style={{background:'#ECFDF5',border:'1px solid #A7F3D0'}}>
                                    <span className="text-[10px] font-black uppercase tracking-widest" style={{color:'#059669'}}>{loc}</span>
                                    <button onClick={() => { if(window.confirm(`Delete ${loc}?`)) deleteLocation(loc); }} className="ml-2 p-1.5 rounded-lg transition-colors" style={{color:'#6EE7B7'}}>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UdharPage;
