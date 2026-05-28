import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTelegram } from '../contexts/TelegramContext'
import AccountBlocked from './AccountBlocked'

const Splash = () => {
    const navigate = useNavigate()
    const { isInTelegram, accessState, verifyAccountAccess, webApp } = useTelegram()
    const [checking, setChecking] = useState(false)
    const [activeIndex, setActiveIndex] = useState(2)

    const galleryImages = [
        "/bear.jpg",
        "/heart-splash.jpg",
        "/headphone-skull.png",
        "/weard-head.png",
        "/coin.jpg"
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % galleryImages.length)
        }, 3000)
        return () => clearInterval(interval)
    }, [galleryImages.length])

    const enterApp = async (path: string) => {
        if (accessState === 'blocked') return
        setChecking(true)
        try {
            const ok = await verifyAccountAccess()
            if (!ok) {
                webApp?.showAlert?.('Your account cannot access GiftedForge.')
                return
            }
            navigate(path)
        } finally {
            setChecking(false)
        }
    }

    const handleContinueWithTelegram = () => {
        const startParam = webApp?.initDataUnsafe?.start_param
        if (startParam?.startsWith('col_')) {
            const id = startParam.substring(4)
            return void enterApp(`/app/collection/${id}`)
        }
        if (startParam?.startsWith('collectible_')) {
            const id = startParam.substring(12)
            return void enterApp(`/asset/${id}`)
        }
        void enterApp('/app/home')
    }

    const handleCreateWallet = () => void enterApp('/app/wallet')

    const handleImportWallet = () => void enterApp('/app/wallet')

    const handleAdminAccess = () => {
        navigate('/admin-access')
    }

    if (accessState === 'blocked') {
        return <AccountBlocked />
    }

    return (
        <div className='bg-[#0E0636] min-h-screen relative overflow-hidden'>
            {/* Background Glows */}
            <div className='absolute top-[-10%] left-[-10%] w-[40%] h-[40%] spotlight-glow rounded-full opacity-50 pointer-events-none'></div>
            <div className='absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] spotlight-glow rounded-full opacity-30 pointer-events-none'></div>

            <div className='max-w-[393px] mx-auto overflow-hidden flex flex-col min-h-screen relative z-10'>
                {/* Image Slider */}
                <div className='pt-12 flex-shrink-0'>
                    <div className='relative mask-fade-edges overflow-hidden h-[305px]'>
                        <div
                            className='flex gap-4 transition-transform duration-700 ease-in-out px-[calc(50%-70px)]'
                            style={{
                                transform: `translateX(-${activeIndex * (242 + 16)}px)`,
                            }}
                        >
                            {galleryImages.map((src, i) => (
                                <div
                                    key={i}
                                    className={`relative flex-shrink-0 transition duration-700 ease-in-out ${activeIndex === i ? 'opacity-100 translate-y-5' : 'opacity-40 translate-y-0'
                                        } will-change-transform`}
                                >
                                    <img
                                        src={src}
                                        className='w-[229px] h-[283px] object-cover border-2 border-white rounded-[32px] shadow-2xl'
                                        alt=""
                                    />
                                    <div className="absolute inset-0 rounded-[32px] reflection-overlay"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Pagination Dots */}
                <div className='justify-center pt-[19px] flex gap-2 items-center h-[13px]'>
                    {galleryImages.map((_, i) => (
                        <div
                            key={i}
                            onClick={() => setActiveIndex(i)}
                            className={` border border-white cursor-pointer transition-all duration-300 rounded-full  ${activeIndex === i
                                    ? 'w-[14px] h-[14px] bg-transparent'
                                    : 'w-[9px] h-[9px] bg-white'
                                }`}
                        ></div>
                    ))}
                </div>

                <div className='text-white pt-12 px-6'>
                    <h2 className='text-center text-2xl font-semibold'>Own. Mint. Trade NFTs.</h2>
                    <p className='text-center pt-4 font-light'>
                        Take control of your digital assets and <br /> StarGifts with GiftedForge—all in one <br /> seamless experience.
                    </p>

                    <button
                        onClick={handleContinueWithTelegram}
                        disabled={checking || accessState === 'blocked'}
                        className={`border ${checking ? "bg-white text-[#0E0636]" : ""} border-white mt-12 rounded-lg w-full h-11 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-50`}
                    >
                        {isInTelegram ? 'Continue with Telegram' : 'Open App'}
                    </button>

                    <div className='flex gap-4 pt-4'>
                        <button
                            onClick={handleCreateWallet}
                            className='border border-white flex-1 rounded-lg h-11 text-sm font-medium hover:bg-white/10 transition-colors'
                        >
                            Create Wallet
                        </button>
                        <button
                            onClick={handleImportWallet}
                            className='border border-white flex-1 rounded-lg h-11 text-sm font-medium hover:bg-white/10 transition-colors'
                        >
                            Import Wallet
                        </button>
                    </div>
                </div>

                <button
                    type='button'
                    onClick={handleAdminAccess}
                    className='w-full flex justify-center pt-12 mb-2 items-center gap-1 text-white/90 hover:text-white transition-colors'
                >
                    <img src="/security-safe.svg" className='w-3.5 h-3.5' alt="" />
                    <p className='text-xs'>Admin Access</p>
                </button>
            </div>
        </div>
    )
}

export default Splash
