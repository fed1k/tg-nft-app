import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTelegram } from '../contexts/TelegramContext'
import AccountBlocked from './AccountBlocked'

const Splash = () => {
    const navigate = useNavigate()
    const { isInTelegram, accessState, verifyAccountAccess, webApp } = useTelegram()
    const [checking, setChecking] = useState(false)
    const [activeIndex, setActiveIndex] = useState(0)

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
                <div className='relative pt-12 mask-fade-edges flex-shrink-0 overflow-hidden'>
                    <div
                        className='flex gap-4 py-4 transition-transform duration-700 ease-in-out px-[calc(50%-70px)]'
                        style={{
                            transform: `translateX(-${activeIndex * (140 + 16)}px)`,
                            width: 'max-content'
                        }}
                    >
                        {galleryImages.map((src, i) => (
                            <div
                                key={i}
                                className={`relative flex-shrink-0 transition-all duration-700 ${activeIndex === i ? 'opacity-100  translate-y-2.5' : 'opacity-40 -translate-y-2.5'
                                    }`}
                            >
                                <img
                                    src={src}
                                    className='w-[140px] h-[190px] object-cover border-[1.5px] border-white/20 rounded-[32px] shadow-2xl'
                                    alt=""
                                />
                                <div className="absolute inset-0 rounded-[32px] reflection-overlay"></div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Pagination Dots */}
                <div className='justify-center pt-[19px] flex gap-2 items-center'>
                    {galleryImages.map((_, i) => (
                        <div
                            key={i}
                            onClick={() => setActiveIndex(i)}
                            className={`cursor-pointer transition-all duration-300 rounded-full ${activeIndex === i
                                    ? 'w-[13px] h-[13px] border border-white'
                                    : 'w-[9px] h-[9px] bg-white'
                                }`}
                        ></div>
                    ))}
                </div>

                <div className='text-white pt-12 px-6'>
                    <h2 className='text-center text-2xl font-semibold'>Own. Mint. Trade NFTs.</h2>
                    <p className='text-center pt-4'>
                        Take control of your digital assets and <br /> StarGifts with GiftedForge—all in one <br /> seamless experience.
                    </p>

                    <button
                        onClick={handleContinueWithTelegram}
                        disabled={checking || accessState === 'blocked'}
                        className='border border-white mt-12 rounded-lg w-full h-11 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-50'
                    >
                        {checking ? 'Checking…' : isInTelegram ? 'Continue with Telegram' : 'Open App'}
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
